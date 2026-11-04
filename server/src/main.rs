use std::{collections::HashMap, net::SocketAddr, path::Path, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{
        ConnectInfo, DefaultBodyLimit, Path as RoutePath, Query, State, WebSocketUpgrade,
        ws::{Message as WsMessage, WebSocket},
    },
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{
    FromRow, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use tokio::sync::{Mutex, broadcast};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
};
use uuid::Uuid;

type Result<T> = std::result::Result<T, ApiError>;
const SESSION_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const READ: u32 = 1;
const SEND: u32 = 2;
const MANAGE_CHANNELS: u32 = 4;
const MODERATE: u32 = 8;
const MANAGE_ROLES: u32 = 16;
const MESSAGE_SELECT: &str = "SELECT m.seq,m.id,m.channel_id,m.content,m.created_at,m.edited_at,u.id AS author_id,u.name AS author_name,u.role AS author_role,u.public_key AS author_key,r.id AS reply_id,r.content AS reply_content,ru.name AS reply_author FROM messages m JOIN users u ON u.id=m.user_id LEFT JOIN messages r ON r.id=m.reply_to LEFT JOIN users ru ON ru.id=r.user_id";

#[derive(Clone)]
struct AppState(Arc<Inner>);
struct Inner {
    db: SqlitePool,
    node_id: String,
    name: String,
    owner_key: Option<String>,
    origins: Vec<String>,
    challenges: Mutex<HashMap<String, Challenge>>,
    sessions: Mutex<HashMap<String, Session>>,
    presence: Mutex<HashMap<String, usize>>,
    limits: Mutex<HashMap<String, (i64, u32)>>,
    events: broadcast::Sender<Value>,
    livekit: Option<LiveKit>,
}
struct LiveKit {
    url: String,
    key: String,
    secret: String,
}
struct Challenge {
    key: String,
    message: String,
    expires: i64,
}
#[derive(Clone)]
struct Session {
    user_id: String,
    expires: i64,
}

#[derive(Debug)]
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!(%error, "database operation failed");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The node could not save this change.".into(),
        )
    }
}
fn bad(message: &str) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, message.into())
}
fn unauthorized() -> ApiError {
    ApiError(
        StatusCode::UNAUTHORIZED,
        "Sign in to this node to continue.".into(),
    )
}
fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn uid() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Clone, Serialize, FromRow)]
struct User {
    id: String,
    name: String,
    role: String,
    public_key: String,
}
#[derive(Clone, Serialize, FromRow)]
struct Channel {
    id: String,
    name: String,
    topic: String,
    kind: String,
    position: i64,
}
#[derive(FromRow)]
struct MessageRow {
    seq: i64,
    id: String,
    channel_id: String,
    content: String,
    created_at: i64,
    edited_at: Option<i64>,
    author_id: String,
    author_name: String,
    author_role: String,
    author_key: String,
    reply_id: Option<String>,
    reply_content: Option<String>,
    reply_author: Option<String>,
}
#[derive(Serialize)]
struct ChatMessage {
    seq: i64,
    id: String,
    channel_id: String,
    content: String,
    created_at: i64,
    edited_at: Option<i64>,
    author: User,
    reply: Option<Reply>,
    reactions: Vec<Reaction>,
}
#[derive(Serialize)]
struct Reply {
    id: String,
    content: String,
    author: String,
}
#[derive(Serialize, FromRow)]
struct Reaction {
    emoji: String,
    count: i64,
    users: String,
}

impl AppState {
    fn emit(&self, value: Value) {
        let _ = self.0.events.send(value);
    }
    async fn rate(&self, key: String, maximum: u32, window_ms: i64) -> Result<()> {
        let mut limits = self.0.limits.lock().await;
        let timestamp = now();
        limits.retain(|_, (until, _)| *until > timestamp);
        let entry = limits.entry(key).or_insert((timestamp + window_ms, 0));
        entry.1 += 1;
        if entry.1 > maximum {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Slow down a little and try again shortly.".into(),
            ));
        }
        Ok(())
    }
    async fn user_by_token(&self, token: &str) -> Result<User> {
        let session = {
            let mut sessions = self.0.sessions.lock().await;
            sessions.retain(|_, session| session.expires > now());
            sessions.get(token).cloned().ok_or_else(unauthorized)?
        };
        sqlx::query_as::<_, User>("SELECT id,name,role,public_key FROM users WHERE id=?")
            .bind(session.user_id)
            .fetch_optional(&self.0.db)
            .await?
            .ok_or_else(unauthorized)
    }
    async fn user(&self, headers: &HeaderMap) -> Result<User> {
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .ok_or_else(unauthorized)?;
        self.user_by_token(token).await
    }
    async fn presence_event(&self) -> Value {
        let online: Vec<String> = self.0.presence.lock().await.keys().cloned().collect();
        json!({"type":"presence", "online": online})
    }
    async fn channel(&self, id: &str) -> Result<Channel> {
        sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id=?")
            .bind(id)
            .fetch_optional(&self.0.db)
            .await?
            .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "That channel does not exist.".into()))
    }
    async fn message(&self, id: &str) -> Result<ChatMessage> {
        let row = sqlx::query_as::<_, MessageRow>(&format!("{MESSAGE_SELECT} WHERE m.id=?"))
            .bind(id)
            .fetch_optional(&self.0.db)
            .await?
            .ok_or_else(|| {
                ApiError(
                    StatusCode::NOT_FOUND,
                    "That message no longer exists.".into(),
                )
            })?;
        self.hydrate(row).await
    }
    async fn hydrate(&self, row: MessageRow) -> Result<ChatMessage> {
        let reactions = sqlx::query_as::<_, Reaction>("SELECT emoji,COUNT(*) AS count,GROUP_CONCAT(user_id) AS users FROM reactions WHERE message_id=? GROUP BY emoji ORDER BY emoji")
            .bind(&row.id).fetch_all(&self.0.db).await?;
        Ok(ChatMessage {
            seq: row.seq,
            id: row.id,
            channel_id: row.channel_id,
            content: row.content,
            created_at: row.created_at,
            edited_at: row.edited_at,
            author: User {
                id: row.author_id,
                name: row.author_name,
                role: row.author_role,
                public_key: row.author_key,
            },
            reply: row.reply_id.map(|id| Reply {
                id,
                content: row.reply_content.unwrap_or_default(),
                author: row.reply_author.unwrap_or_default(),
            }),
            reactions,
        })
    }
}
fn permissions(role: &str) -> u32 {
    match role {
        "owner" => READ | SEND | MANAGE_CHANNELS | MODERATE | MANAGE_ROLES,
        "moderator" => READ | SEND | MANAGE_CHANNELS | MODERATE,
        _ => READ | SEND,
    }
}
fn require(user: &User, permission: u32) -> Result<()> {
    if permissions(&user.role) & permission == permission {
        Ok(())
    } else {
        Err(ApiError(
            StatusCode::FORBIDDEN,
            "Your role does not allow this action.".into(),
        ))
    }
}
fn validate_name(input: &str) -> Result<String> {
    let name = input.trim();
    if !(2..=32).contains(&name.chars().count()) || name.chars().any(char::is_control) {
        return Err(bad("Use a display name with 2–32 characters."));
    }
    Ok(name.into())
}
fn valid_key(key: &str) -> Result<VerifyingKey> {
    let bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(key)
        .map_err(|_| bad("Invalid identity key."))?
        .try_into()
        .map_err(|_| bad("Invalid identity key."))?;
    VerifyingKey::from_bytes(&bytes).map_err(|_| bad("Invalid identity key."))
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "raeen_node=info,tower_http=info".into()),
        )
        .init();
    let path = std::env::var("RAEEN_DATABASE").unwrap_or_else(|_| "data/raeen.db".into());
    if let Some(parent) = Path::new(&path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true)
                .foreign_keys(true)
                .journal_mode(SqliteJournalMode::Wal)
                .busy_timeout(Duration::from_secs(5)),
        )
        .await?;
    sqlx::raw_sql(include_str!("../schema.sql"))
        .execute(&db)
        .await?;
    sqlx::query("INSERT OR IGNORE INTO settings(key,value) VALUES ('node_id',?)")
        .bind(uid())
        .execute(&db)
        .await?;
    let node_id: String = sqlx::query_scalar("SELECT value FROM settings WHERE key='node_id'")
        .fetch_one(&db)
        .await?;
    for (position, (name, topic, kind)) in [
        (
            "general",
            "A little bit of everything. Make yourself at home.",
            "text",
        ),
        (
            "introductions",
            "New around here? Tell us a little about yourself.",
            "text",
        ),
        (
            "build-log",
            "Small wins, work in progress, and things worth sharing.",
            "text",
        ),
        ("The Lounge", "An open door. Drop in and hang out.", "voice"),
        (
            "Co-op room",
            "Good company for your next adventure.",
            "voice",
        ),
    ]
    .iter()
    .enumerate()
    {
        sqlx::query(
            "INSERT OR IGNORE INTO channels(id,name,topic,kind,position) VALUES (?,?,?,?,?)",
        )
        .bind(format!("default-{position}"))
        .bind(name)
        .bind(topic)
        .bind(kind)
        .bind(position as i64)
        .execute(&db)
        .await?;
    }
    let origins: Vec<String> = std::env::var("RAEEN_ORIGINS").unwrap_or_else(|_| "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001,tauri://localhost,http://tauri.localhost,https://tauri.localhost".into())
        .split(',').map(|s| s.trim().into()).filter(|s: &String| !s.is_empty()).collect();
    let livekit = match (
        std::env::var("LIVEKIT_URL"),
        std::env::var("LIVEKIT_API_KEY"),
        std::env::var("LIVEKIT_API_SECRET"),
    ) {
        (Ok(url), Ok(key), Ok(secret))
            if !url.is_empty() && !key.is_empty() && !secret.is_empty() =>
        {
            Some(LiveKit { url, key, secret })
        }
        _ => None,
    };
    let owner_key = std::env::var("RAEEN_OWNER_KEY")
        .ok()
        .filter(|s| !s.is_empty());
    if let Some(key) = &owner_key {
        valid_key(key).map_err(|_| "RAEEN_OWNER_KEY must be a base64url Ed25519 public key")?;
    }
    let state = AppState(Arc::new(Inner {
        db,
        node_id,
        name: std::env::var("RAEEN_NAME").unwrap_or_else(|_| "The Commons".into()),
        owner_key,
        origins: origins.clone(),
        challenges: Mutex::new(HashMap::new()),
        sessions: Mutex::new(HashMap::new()),
        presence: Mutex::new(HashMap::new()),
        limits: Mutex::new(HashMap::new()),
        events: broadcast::channel(512).0,
        livekit,
    }));
    let cors = CorsLayer::new()
        .allow_origin(
            origins
                .iter()
                .map(|s| s.parse::<HeaderValue>())
                .collect::<std::result::Result<Vec<_>, _>>()?,
        )
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);
    let app = Router::new()
        .route("/api/health",get(|| async { Json(json!({"ok":true,"version":env!("CARGO_PKG_VERSION")})) }))
        .route("/api/node",get(node_info))
        .route("/api/auth/challenge",post(challenge))
        .route("/api/auth/verify",post(verify))
        .route("/api/auth/logout",post(logout))
        .route("/api/bootstrap",get(bootstrap))
        .route("/api/profile",patch(profile))
        .route("/api/channels",post(create_channel))
        .route("/api/channels/{id}/messages",get(messages).post(send_message))
        .route("/api/messages/{id}",patch(edit_message).delete(delete_message))
        .route("/api/messages/{id}/reactions",post(reaction))
        .route("/api/search",get(search))
        .route("/api/members/{id}/role",patch(change_role))
        .route("/api/voice/token",post(voice_token))
        .route("/ws",get(websocket))
        .fallback_service(ServeDir::new("dist").not_found_service(ServeFile::new("dist/index.html")))
        .layer(DefaultBodyLimit::max(32 * 1024))
        .layer(cors)
        .layer(SetResponseHeaderLayer::if_not_present(header::X_CONTENT_TYPE_OPTIONS,HeaderValue::from_static("nosniff")))
        .layer(SetResponseHeaderLayer::if_not_present(header::REFERRER_POLICY,HeaderValue::from_static("no-referrer")))
        .layer(SetResponseHeaderLayer::if_not_present(header::CACHE_CONTROL,HeaderValue::from_static("no-store")))
        .layer(SetResponseHeaderLayer::if_not_present(header::CONTENT_SECURITY_POLICY,HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https: http: wss: ws:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'")))
        .with_state(state);
    let address = std::env::var("RAEEN_BIND").unwrap_or_else(|_| "127.0.0.1:3001".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!(%address,"Raeen node ready");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}

async fn node_info(State(state): State<AppState>) -> Json<Value> {
    Json(
        json!({"id":state.0.node_id,"name":state.0.name,"protocol":"raeen/0.1","version":env!("CARGO_PKG_VERSION"),"voice_enabled":state.0.livekit.is_some(),"encryption":"transport-only","registration":"open"}),
    )
}
#[derive(Deserialize)]
struct ChallengeInput {
    public_key: String,
}
async fn challenge(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Json(input): Json<ChallengeInput>,
) -> Result<Json<Value>> {
    state
        .rate(format!("auth:{}", address.ip()), 30, 60_000)
        .await?;
    valid_key(&input.public_key)?;
    let id = uid();
    let expires = now() + 60_000;
    let message = format!(
        "Raeen sign-in v1\nNode: {}\nKey: {}\nNonce: {}{}\nExpires: {}",
        state.0.node_id,
        input.public_key,
        uid(),
        uid(),
        expires
    );
    let mut challenges = state.0.challenges.lock().await;
    challenges.retain(|_, c| c.expires > now());
    if challenges.len() >= 10_000 {
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "The node is busy. Try again shortly.".into(),
        ));
    }
    challenges.insert(
        id.clone(),
        Challenge {
            key: input.public_key,
            message: message.clone(),
            expires,
        },
    );
    Ok(Json(
        json!({"id":id,"message":message,"expires_at":expires}),
    ))
}
#[derive(Deserialize)]
struct VerifyInput {
    challenge_id: String,
    signature: String,
    name: String,
}
async fn verify(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Json(input): Json<VerifyInput>,
) -> Result<Json<Value>> {
    state
        .rate(format!("verify:{}", address.ip()), 60, 60_000)
        .await?;
    let name = validate_name(&input.name)?;
    let challenge = state
        .0
        .challenges
        .lock()
        .await
        .remove(&input.challenge_id)
        .ok_or_else(unauthorized)?;
    if challenge.expires <= now() {
        return Err(unauthorized());
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(input.signature)
        .map_err(|_| unauthorized())?;
    let signature = Signature::from_slice(&bytes).map_err(|_| unauthorized())?;
    valid_key(&challenge.key)?
        .verify_strict(challenge.message.as_bytes(), &signature)
        .map_err(|_| unauthorized())?;
    // This single write computes first-owner assignment atomically under SQLite's write lock.
    sqlx::query("INSERT INTO users(id,public_key,name,role,created_at) SELECT ?,?,?,CASE WHEN ? IS NOT NULL THEN CASE WHEN public_owner.key=? THEN 'owner' ELSE 'member' END WHEN NOT EXISTS(SELECT 1 FROM users) THEN 'owner' ELSE 'member' END,? FROM (SELECT ? AS key) public_owner WHERE true ON CONFLICT(public_key) DO UPDATE SET name=excluded.name")
        .bind(uid()).bind(&challenge.key).bind(name).bind(&state.0.owner_key).bind(&challenge.key).bind(now()).bind(&state.0.owner_key).execute(&state.0.db).await?;
    let user =
        sqlx::query_as::<_, User>("SELECT id,name,role,public_key FROM users WHERE public_key=?")
            .bind(challenge.key)
            .fetch_one(&state.0.db)
            .await?;
    let token = format!("{}{}", uid(), uid());
    let expires = now() + SESSION_MS;
    let mut sessions = state.0.sessions.lock().await;
    sessions.retain(|_, session| session.expires > now());
    sessions.insert(
        token.clone(),
        Session {
            user_id: user.id.clone(),
            expires,
        },
    );
    drop(sessions);
    state.emit(json!({"type":"members_changed"}));
    Ok(Json(
        json!({"token":token,"user":user,"expires_at":expires}),
    ))
}
async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<StatusCode> {
    state.user(&headers).await?;
    if let Some(token) = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
    {
        state.0.sessions.lock().await.remove(token);
    }
    Ok(StatusCode::NO_CONTENT)
}
async fn bootstrap(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>> {
    let user = state.user(&headers).await?;
    let channels = sqlx::query_as::<_, Channel>("SELECT * FROM channels ORDER BY position,name")
        .fetch_all(&state.0.db)
        .await?;
    let members =
        sqlx::query_as::<_, User>("SELECT id,name,role,public_key FROM users ORDER BY created_at")
            .fetch_all(&state.0.db)
            .await?;
    let online: Vec<String> = state.0.presence.lock().await.keys().cloned().collect();
    let message_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
        .fetch_one(&state.0.db)
        .await?;
    Ok(Json(
        json!({"user":user,"channels":channels,"members":members,"online":online,"message_count":message_count,"node":{"id":state.0.node_id,"name":state.0.name,"voice_enabled":state.0.livekit.is_some()}}),
    ))
}
#[derive(Deserialize)]
struct ProfileInput {
    name: String,
}
async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ProfileInput>,
) -> Result<Json<User>> {
    let mut user = state.user(&headers).await?;
    user.name = validate_name(&input.name)?;
    sqlx::query("UPDATE users SET name=? WHERE id=?")
        .bind(&user.name)
        .bind(&user.id)
        .execute(&state.0.db)
        .await?;
    state.emit(json!({"type":"members_changed"}));
    Ok(Json(user))
}
#[derive(Deserialize)]
struct ChannelInput {
    name: String,
    topic: String,
    kind: String,
}
async fn create_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ChannelInput>,
) -> Result<Json<Channel>> {
    let user = state.user(&headers).await?;
    require(&user, MANAGE_CHANNELS)?;
    state
        .rate(format!("channels:{}", user.id), 10, 60_000)
        .await?;
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 32 || name.chars().any(char::is_control) {
        return Err(bad("Channel names must have 1–32 characters."));
    }
    if input.kind != "text" && input.kind != "voice" {
        return Err(bad("Choose a text or voice channel."));
    }
    if input.topic.chars().count() > 160 {
        return Err(bad("Keep the topic under 160 characters."));
    }
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM channels WHERE name=?")
        .bind(&name)
        .fetch_one(&state.0.db)
        .await?;
    if exists > 0 {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "A channel with that name already exists.".into(),
        ));
    }
    let channel = Channel {
        id: uid(),
        name,
        topic: input.topic.trim().into(),
        kind: input.kind,
        position: now(),
    };
    sqlx::query("INSERT INTO channels(id,name,topic,kind,position) VALUES (?,?,?,?,?)")
        .bind(&channel.id)
        .bind(&channel.name)
        .bind(&channel.topic)
        .bind(&channel.kind)
        .bind(channel.position)
        .execute(&state.0.db)
        .await?;
    state.emit(json!({"type":"channels_changed"}));
    Ok(Json(channel))
}
#[derive(Deserialize)]
struct MessagesQuery {
    before: Option<i64>,
}
async fn messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    RoutePath(id): RoutePath<String>,
    Query(query): Query<MessagesQuery>,
) -> Result<Json<Vec<ChatMessage>>> {
    state.user(&headers).await?;
    state.channel(&id).await?;
    let rows = sqlx::query_as::<_, MessageRow>(&format!(
        "{MESSAGE_SELECT} WHERE m.channel_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 60"
    ))
    .bind(id)
    .bind(query.before.unwrap_or(i64::MAX))
    .fetch_all(&state.0.db)
    .await?;
    let mut result = Vec::new();
    for row in rows.into_iter().rev() {
        result.push(state.hydrate(row).await?);
    }
    Ok(Json(result))
}
#[derive(Deserialize)]
struct SendInput {
    content: String,
    reply_to: Option<String>,
    client_id: String,
}
fn content(input: &str) -> Result<String> {
    let text = input.trim();
    if text.is_empty() || text.chars().count() > 4000 || text.contains('\0') {
        return Err(bad("Messages must contain 1–4,000 characters."));
    }
    Ok(text.into())
}
async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    RoutePath(id): RoutePath<String>,
    Json(input): Json<SendInput>,
) -> Result<Json<ChatMessage>> {
    let user = state.user(&headers).await?;
    require(&user, SEND)?;
    state.rate(format!("send:{}", user.id), 40, 10_000).await?;
    if state.channel(&id).await?.kind != "text" {
        return Err(bad("Send messages in a text channel."));
    }
    let text = content(&input.content)?;
    if Uuid::parse_str(&input.client_id).is_err() {
        return Err(bad("A valid client message ID is required."));
    }
    if let Some(reply_id) = &input.reply_to
        && state.message(reply_id).await?.channel_id != id
    {
        return Err(bad("Replies must stay in the same channel."));
    }
    let message_id = uid();
    let result = sqlx::query("INSERT INTO messages(id,channel_id,user_id,content,created_at,reply_to,client_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,client_id) DO NOTHING")
        .bind(&message_id).bind(&id).bind(&user.id).bind(text).bind(now()).bind(input.reply_to).bind(&input.client_id).execute(&state.0.db).await?;
    let actual_id: String = sqlx::query_scalar(
        "SELECT id FROM messages WHERE user_id=? AND client_id=? AND channel_id=?",
    )
    .bind(user.id)
    .bind(input.client_id)
    .bind(id)
    .fetch_optional(&state.0.db)
    .await?
    .ok_or_else(|| bad("That client message ID belongs to another channel."))?;
    let message = state.message(&actual_id).await?;
    if result.rows_affected() > 0 {
        state.emit(json!({"type":"message_created","message":message}));
    }
    Ok(Json(message))
}
#[derive(Deserialize)]
struct EditInput {
    content: String,
}
async fn edit_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    RoutePath(id): RoutePath<String>,
    Json(input): Json<EditInput>,
) -> Result<Json<ChatMessage>> {
    let user = state.user(&headers).await?;
    let message = state.message(&id).await?;
    if message.author.id != user.id {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "You can only edit your own messages.".into(),
        ));
    }
    state.rate(format!("edit:{}", user.id), 30, 10_000).await?;
    sqlx::query("UPDATE messages SET content=?,edited_at=? WHERE id=?")
        .bind(content(&input.content)?)
        .bind(now())
        .bind(&id)
        .execute(&state.0.db)
        .await?;
    let updated = state.message(&id).await?;
    state.emit(json!({"type":"message_updated","message":updated}));
    // Replies reference the original live message; refreshing keeps quote previews consistent.
    state.emit(json!({"type":"history_changed","channel_id":message.channel_id}));
    Ok(Json(updated))
}
async fn delete_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    RoutePath(id): RoutePath<String>,
) -> Result<StatusCode> {
    let user = state.user(&headers).await?;
    let message = state.message(&id).await?;
    if message.author.id != user.id {
        require(&user, MODERATE)?;
    }
    sqlx::query("DELETE FROM messages WHERE id=?")
        .bind(&id)
        .execute(&state.0.db)
        .await?;
    state.emit(json!({"type":"message_deleted","id":id,"channel_id":message.channel_id}));
    state.emit(json!({"type":"history_changed","channel_id":message.channel_id}));
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize)]
struct ReactionInput {
    emoji: String,
}
async fn reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    RoutePath(id): RoutePath<String>,
    Json(input): Json<ReactionInput>,
) -> Result<Json<ChatMessage>> {
    let user = state.user(&headers).await?;
    state
        .rate(format!("reaction:{}", user.id), 40, 10_000)
        .await?;
    if !["👍", "❤️", "🔥", "🎉", "👀", "✅"].contains(&input.emoji.as_str()) {
        return Err(bad("Choose a supported reaction."));
    }
    state.message(&id).await?;
    let removed = sqlx::query("DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?")
        .bind(&id)
        .bind(&user.id)
        .bind(&input.emoji)
        .execute(&state.0.db)
        .await?;
    if removed.rows_affected() == 0 {
        sqlx::query("INSERT OR IGNORE INTO reactions VALUES (?,?,?)")
            .bind(&id)
            .bind(user.id)
            .bind(input.emoji)
            .execute(&state.0.db)
            .await?;
    }
    let message = state.message(&id).await?;
    state.emit(json!({"type":"message_updated","message":message}));
    Ok(Json(message))
}
#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    channel: Option<String>,
}
async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<ChatMessage>>> {
    let user = state.user(&headers).await?;
    state
        .rate(format!("search:{}", user.id), 30, 60_000)
        .await?;
    if query.q.chars().count() > 120 {
        return Err(bad("Search queries can have up to 120 characters."));
    }
    // Quote each term to keep FTS syntax literal and parameterize every value.
    let terms: Vec<String> = query
        .q
        .split_whitespace()
        .take(12)
        .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
        .collect();
    if terms.is_empty() {
        return Ok(Json(vec![]));
    }
    let rows=sqlx::query_as::<_,MessageRow>(&format!("{MESSAGE_SELECT} WHERE m.seq IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?) AND (? IS NULL OR m.channel_id=?) ORDER BY m.seq DESC LIMIT 50"))
        .bind(terms.join(" AND ")).bind(&query.channel).bind(&query.channel).fetch_all(&state.0.db).await?;
    let mut messages = Vec::new();
    for row in rows {
        messages.push(state.hydrate(row).await?);
    }
    Ok(Json(messages))
}
#[derive(Deserialize)]
struct RoleInput {
    role: String,
}
async fn change_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    RoutePath(id): RoutePath<String>,
    Json(input): Json<RoleInput>,
) -> Result<StatusCode> {
    let user = state.user(&headers).await?;
    require(&user, MANAGE_ROLES)?;
    if input.role != "member" && input.role != "moderator" {
        return Err(bad("Choose member or moderator."));
    }
    let result = sqlx::query("UPDATE users SET role=? WHERE id=? AND role!='owner'")
        .bind(input.role)
        .bind(id)
        .execute(&state.0.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(bad("The owner role cannot be changed here."));
    }
    state.emit(json!({"type":"members_changed"}));
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize)]
struct VoiceInput {
    channel_id: String,
}
async fn voice_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<VoiceInput>,
) -> Result<Json<Value>> {
    let user = state.user(&headers).await?;
    state.rate(format!("voice:{}", user.id), 10, 60_000).await?;
    if state.channel(&input.channel_id).await?.kind != "voice" {
        return Err(bad("Choose a voice channel."));
    }
    let config=state.0.livekit.as_ref().ok_or_else(||ApiError(StatusCode::SERVICE_UNAVAILABLE,"Voice is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET on this node.".into()))?;
    let claims = json!({"iss":config.key,"sub":user.id,"name":user.name,"nbf":now()/1000-5,"exp":now()/1000+300,"video":{"roomJoin":true,"room":format!("{}:{}",state.0.node_id,input.channel_id),"canPublish":true,"canSubscribe":true,"canPublishData":true}});
    let token = jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(config.secret.as_bytes()),
    )
    .map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not create a voice session.".into(),
        )
    })?;
    Ok(Json(json!({"url":config.url,"token":token,"e2ee":false})))
}

async fn websocket(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    if let Some(origin) = headers.get(header::ORIGIN)
        && !state
            .0
            .origins
            .iter()
            .any(|allowed| origin.as_bytes() == allowed.as_bytes())
    {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "This origin is not allowed by the node.".into(),
        ));
    }
    Ok(ws
        .max_message_size(8192)
        .max_frame_size(8192)
        .on_upgrade(move |socket| socket_session(socket, state)))
}
async fn socket_session(mut socket: WebSocket, state: AppState) {
    let Ok(Some(Ok(WsMessage::Text(first)))) =
        tokio::time::timeout(Duration::from_secs(5), socket.recv()).await
    else {
        return;
    };
    let Ok(auth) = serde_json::from_str::<Value>(&first) else {
        return;
    };
    if auth["type"] != "authenticate" {
        return;
    }
    let Some(token) = auth["token"].as_str().map(String::from) else {
        return;
    };
    let Ok(user) = state.user_by_token(&token).await else {
        return;
    };
    let mut events = state.0.events.subscribe();
    {
        let mut presence = state.0.presence.lock().await;
        *presence.entry(user.id.clone()).or_insert(0) += 1;
    }
    state.emit(state.presence_event().await);
    let (mut sender, mut receiver) = socket.split();
    if sender
        .send(WsMessage::Text(json!({"type":"ready"}).to_string().into()))
        .await
        .is_err()
    {
        remove_presence(&state, &user.id).await;
        return;
    }
    let mut heartbeat = tokio::time::interval(Duration::from_secs(25));
    let mut last_seen = now();
    let mut last_typing = 0;
    loop {
        tokio::select! {
            event=events.recv() => {
                let value=match event {
                    Ok(value)=>value,
                    Err(broadcast::error::RecvError::Lagged(_))=>json!({"type":"resync"}),
                    Err(_)=>break,
                };
                if sender.send(WsMessage::Text(value.to_string().into())).await.is_err() { break; }
            }
            incoming=receiver.next() => {
                match incoming {
                    Some(Ok(WsMessage::Text(text)))=>{
                        last_seen=now();
                        if let Ok(value)=serde_json::from_str::<Value>(&text)
                            && value["type"]=="typing" && now()-last_typing>2000
                                && let Some(channel)=value["channel_id"].as_str()
                                    && state.channel(channel).await.is_ok() {
                                        last_typing=now();
                                        state.emit(json!({"type":"typing","channel_id":channel,"user_id":user.id,"name":user.name}));
                                    }
                    }
                    Some(Ok(WsMessage::Pong(_)))=>{last_seen=now();}
                    Some(Ok(WsMessage::Ping(bytes)))=>{last_seen=now();if sender.send(WsMessage::Pong(bytes)).await.is_err(){break;}}
                    Some(Ok(WsMessage::Close(_)))|None|Some(Err(_))=>break,
                    _=>{}
                }
            }
            _=heartbeat.tick()=>{
                if now()-last_seen>75_000 || state.user_by_token(&token).await.is_err() { break; }
                if sender.send(WsMessage::Ping(vec![].into())).await.is_err(){break;}
            }
        }
    }
    remove_presence(&state, &user.id).await;
}
async fn remove_presence(state: &AppState, id: &str) {
    let mut presence = state.0.presence.lock().await;
    if let Some(count) = presence.get_mut(id) {
        *count = count.saturating_sub(1);
        if *count == 0 {
            presence.remove(id);
        }
    }
    drop(presence);
    state.emit(state.presence_event().await);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roles_are_separate() {
        let member = permissions("member");
        assert_eq!(member & SEND, SEND);
        assert_eq!(member & (MANAGE_CHANNELS | MODERATE | MANAGE_ROLES), 0);
        assert_eq!(permissions("moderator") & MANAGE_ROLES, 0);
        assert_eq!(permissions("owner") & MANAGE_ROLES, MANAGE_ROLES);
    }
    #[test]
    fn rejects_empty_or_oversized_content() {
        assert!(content("   ").is_err());
        assert!(content(&"a".repeat(4001)).is_err());
        assert!(content("hi\0there").is_err());
        assert_eq!(content("  hello  ").unwrap(), "hello");
    }
}
