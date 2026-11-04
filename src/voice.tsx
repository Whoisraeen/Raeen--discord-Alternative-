import { useEffect, useRef, useState } from 'react';
import { Headphones, Mic, MicOff, MonitorUp, PhoneOff, Volume2 } from 'lucide-react';
import type { Room, RemoteAudioTrack, RemoteVideoTrack, LocalVideoTrack, Participant } from 'livekit-client';
import type { Channel } from './types';
import type { NodeClient } from './api';
import { initials } from './components';

export type Share = { id: string; name: string; track: RemoteVideoTrack | LocalVideoTrack };
export function useVoice(client: NodeClient | null, report: (message: string) => void) {
  const roomRef = useRef<Room | null>(null),
    mediaRoot = useRef<HTMLDivElement | null>(null),
    operation = useRef(0),
    deafenedRef = useRef(false);
  const [channel, setChannel] = useState<Channel | null>(null),
    [joining, setJoining] = useState(false),
    [muted, setMuted] = useState(false),
    [deafened, setDeafened] = useState(false),
    [sharing, setSharing] = useState(false),
    [participants, setParticipants] = useState<Participant[]>([]),
    [shares, setShares] = useState<Share[]>([]),
    [needsAudio, setNeedsAudio] = useState(false);
  const leave = async () => {
    operation.current++;
    const room = roomRef.current;
    roomRef.current = null;
    await room?.disconnect();
    mediaRoot.current?.replaceChildren();
    deafenedRef.current = false;
    setChannel(null);
    setParticipants([]);
    setShares([]);
    setMuted(false);
    setDeafened(false);
    setSharing(false);
    setJoining(false);
    setNeedsAudio(false);
  };
  useEffect(() => {
    setChannel(null);
    setParticipants([]);
    setShares([]);
    setMuted(false);
    setDeafened(false);
    setSharing(false);
    setJoining(false);
    setNeedsAudio(false);
    deafenedRef.current = false;
    const root = document.createElement('div');
    root.id = 'raeen-remote-audio';
    document.body.append(root);
    mediaRoot.current = root;
    return () => {
      operation.current++;
      void roomRef.current?.disconnect();
      roomRef.current = null;
      root.remove();
    };
  }, [client]);
  const join = async (next: Channel) => {
    if (!client || joining || next.id === channel?.id) return;
    await leave();
    const attempt = ++operation.current;
    setJoining(true);
    let room: Room | null = null;
    try {
      const credentials = await client.post<{ url: string; token: string }>('/api/voice/token', {
        channel_id: next.id,
      });
      const { Room, RoomEvent, Track } = await import('livekit-client');
      if (attempt !== operation.current) return;
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;
      const currentRoom = room;
      const update = () => {
        setParticipants([currentRoom.localParticipant, ...currentRoom.remoteParticipants.values()]);
        const nextShares: Share[] = [];
        for (const participant of [
          currentRoom.localParticipant,
          ...currentRoom.remoteParticipants.values(),
        ]) {
          for (const publication of participant.videoTrackPublications.values()) {
            if (publication.source === Track.Source.ScreenShare && publication.track)
              nextShares.push({
                id: publication.trackSid,
                name: participant.name || participant.identity,
                track: publication.track as Share['track'],
              });
          }
        }
        setShares(nextShares);
        setSharing(currentRoom.localParticipant.isScreenShareEnabled);
      };
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audio = (track as RemoteAudioTrack).attach();
          audio.muted = deafenedRef.current;
          mediaRoot.current?.append(audio);
        }
        update();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
        update();
      });
      room
        .on(RoomEvent.ParticipantConnected, update)
        .on(RoomEvent.ParticipantDisconnected, update)
        .on(RoomEvent.ActiveSpeakersChanged, update)
        .on(RoomEvent.LocalTrackPublished, update)
        .on(RoomEvent.LocalTrackUnpublished, update)
        .on(RoomEvent.TrackMuted, update)
        .on(RoomEvent.TrackUnmuted, update);
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudio(!currentRoom.canPlaybackAudio));
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === currentRoom) {
          roomRef.current = null;
          setChannel(null);
          setParticipants([]);
          setShares([]);
          mediaRoot.current?.replaceChildren();
        }
      });
      await room.connect(credentials.url, credentials.token);
      if (attempt !== operation.current) {
        await room.disconnect();
        return;
      }
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio();
      setChannel(next);
      update();
    } catch (error) {
      await room?.disconnect();
      if (roomRef.current === room) roomRef.current = null;
      if (attempt === operation.current)
        report(error instanceof Error ? error.message : 'Could not join voice.');
    } finally {
      if (attempt === operation.current) setJoining(false);
    }
  };
  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    } catch (error) {
      report(String(error));
    }
  };
  const toggleDeafen = () => {
    if (!roomRef.current) return;
    const next = !deafened;
    deafenedRef.current = next;
    mediaRoot.current?.querySelectorAll('audio').forEach((audio) => {
      audio.muted = next;
    });
    // Also mute newly attached tracks while deafened.
    roomRef.current.remoteParticipants.forEach((participant) =>
      participant.audioTrackPublications.forEach((publication) =>
        (publication.track as RemoteAudioTrack | undefined)?.setVolume(next ? 0 : 1),
      ),
    );
    setDeafened(next);
  };
  const toggleShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!sharing, { audio: true });
      setSharing(room.localParticipant.isScreenShareEnabled);
    } catch {
      report(
        'Screen sharing was cancelled or is unavailable in this webview. Try Raeen in a desktop browser.',
      );
    }
  };
  return {
    channel,
    joining,
    muted,
    deafened,
    sharing,
    participants,
    shares,
    needsAudio,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleShare,
    enableAudio: () => roomRef.current?.startAudio(),
  };
}
export type VoiceState = ReturnType<typeof useVoice>;
function ScreenTrack({ share }: { share: Share }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = share.track.attach();
    element.muted = true;
    ref.current?.append(element);
    return () => {
      share.track.detach(element);
      element.remove();
    };
  }, [share.track]);
  return (
    <div className="screen-share">
      <div ref={ref} />
      <span>{share.name}’s screen</span>
    </div>
  );
}
export function VoiceView({
  channel,
  voice,
  enabled,
  openSettings,
}: {
  channel: Channel;
  voice: VoiceState;
  enabled: boolean;
  openSettings: () => void;
}) {
  const connected = channel.id === voice.channel?.id;
  return (
    <div className="voice-view">
      <div className="voice-view-heading">
        <span className="channel-large-icon">
          <Volume2 size={30} />
        </span>
        <span className="eyebrow">GOOD COMPANY, ONE CLICK AWAY</span>
        <h1>{channel.name}</h1>
        <p>{channel.topic}</p>
      </div>
      {connected ? (
        <>
          <div className="voice-people">
            {voice.participants.map((participant) => (
              <div
                key={participant.identity}
                className={`voice-person ${participant.isSpeaking ? 'speaking' : ''}`}
              >
                <span>{initials(participant.name || participant.identity)}</span>
                <b>{participant.name || participant.identity.slice(0, 8)}</b>
                {participant.isMicrophoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}
              </div>
            ))}
          </div>
          <div className="voice-controls">
            <button
              className={`round-control ${voice.muted ? 'active' : ''}`}
              onClick={voice.toggleMute}
              aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {voice.muted ? <MicOff size={21} /> : <Mic size={21} />}
            </button>
            <button
              className={`round-control ${voice.deafened ? 'active' : ''}`}
              onClick={voice.toggleDeafen}
              aria-label="Toggle deafen"
            >
              <Headphones size={21} />
            </button>
            <button
              className={`round-control ${voice.sharing ? 'active' : ''}`}
              onClick={voice.toggleShare}
              aria-label="Toggle screen sharing"
            >
              <MonitorUp size={21} />
            </button>
            <button className="round-control disconnect" onClick={voice.leave} aria-label="Leave voice">
              <PhoneOff size={21} />
            </button>
          </div>
          {voice.needsAudio && (
            <button className="primary-btn" onClick={voice.enableAudio}>
              Enable audio playback
            </button>
          )}
          <p className="voice-privacy">
            Voice is encrypted in transit. This MVP does not provide end-to-end encryption.
          </p>
          {voice.shares.map((share) => (
            <ScreenTrack key={share.id} share={share} />
          ))}
        </>
      ) : (
        <div className="voice-join-card">
          <div className="voice-illustration" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <h3>{enabled ? 'Pull up a chair.' : 'Your next conversation starts here.'}</h3>
          <p>
            {enabled
              ? 'Join with your microphone. You can mute or share your screen once you’re in.'
              : 'This community hasn’t connected a voice server yet. The node owner can configure a self-hosted or managed LiveKit server.'}
          </p>
          <button
            className="primary-btn"
            disabled={voice.joining}
            onClick={() => (enabled ? void voice.join(channel) : openSettings())}
          >
            <Volume2 size={17} />
            {voice.joining ? 'Connecting…' : enabled ? 'Join voice channel' : 'View node setup'}
          </button>
          <span className="muted-note">
            {enabled ? 'Your microphone is requested when you join.' : 'Text chat is ready to use.'}
          </span>
        </div>
      )}
    </div>
  );
}
