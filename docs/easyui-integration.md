# EasyUI in Raeen

All 132 entries from the [EasyUI catalog](https://easyui.site/components) are vendored from [Surajmaurya1/easyui](https://github.com/Surajmaurya1/easyui/tree/e1d3baf916c7e8fc19b25b9f82e6bdb3d5bafec5), commit e1d3baf916c7e8fc19b25b9f82e6bdb3d5bafec5. Open **Community home** in the channel sidebar to use the new workspace. Each screen loads on demand.

There is no component showcase screen. Conditional controls appear in their working states: empty search results, loading, selected items, local budget entries, modal dialogs, or the selected backdrop. Effects run only on mounted screens; reduced-motion preferences use static ambient artwork.

## Data and behavior

- Overview and People use live membership, presence, channels, and loaded message history.
- Planner, hosting-budget records, appearance restore points, reminders, and notification-read state are local to this browser/device. These records are not synchronized or encrypted. Export planners and budgets to retain separate copies.
- The node screen labels loaded-history charts and measures HTTP metadata request time; it does not claim CPU/RAM monitoring. The report and connection timeline assemble local metadata without an AI service.
- Budget controls record manual costs and contributions. They do not process payments, contact members, or connect to a bank. Pricing compares hosting responsibilities and a user-entered target; managed hosting is not offered.
- Login and SignUp accept custom key-based form content. Raeen keeps its real Ed25519 onboarding, not EasyUI's example email/password accounts.
- Chat composes the existing virtualized history and per-channel composer inside EasyUI's Chat container. Existing chat actions and drafts remain active.
- The backup checker decrypts the chosen encrypted backup locally and compares its public key with the signed-in identity. It does not replace a key. The six-digit comparison aid is explicitly not security verification.

## Local adaptations

Semantic colors map to Raeen's theme. Website catalog commands, sponsorship configuration, sample finance data, social-profile actions, verification badges, and sample external images are not used. The vendored source includes adaptations for application labels, empty/constant chart data, integer snapshots without invented percentage changes, responsive geometry, keyboard focus, and custom identity forms. Original local SVG artwork supplies decorative images. No additional analytics service was added.

The complete upstream MIT license is retained in public/THIRD_PARTY_NOTICES.md and src/vendor/easyui/LICENSE. The public notice is included in web, Docker, and native bundles.

Run **npm run check:components** to verify all 132 catalog sources are reachable from the app entry point. Browser tests cover chat regressions, private planner and budget persistence, backdrop choices, backup verification, and mobile overflow.

## Screen inventory

| Component                  | Direct app screen / state                                              |
| -------------------------- | ---------------------------------------------------------------------- |
| Activity Feed              | Home                                                                   |
| Activity Heatmap           | Node                                                                   |
| Advanced Data Table        | People                                                                 |
| AI Agent Activity          | Node                                                                   |
| AI Response                | Node, Node, Node, Node                                                 |
| Airport Matrix Clock       | Planner                                                                |
| Alert                      | Node, Node, Node, Budget, Budget, Budget, Guide, Guide, Guide          |
| Animated File Upload       | Guide                                                                  |
| Animated Number Morph      | Home                                                                   |
| Animated Tabs              | Workspace                                                              |
| Avatar Stack               | Home                                                                   |
| Badge                      | Home                                                                   |
| Bar Chart                  | Node                                                                   |
| Batch Gesture Tray         | Planner                                                                |
| Book Call Button           | Home                                                                   |
| Branching Submenu          | Planner                                                                |
| Breadcrumb                 | Workspace                                                              |
| Button                     | Workspace, Home, People, Planner, Budget, Appearance, Guide            |
| Calendar                   | Planner                                                                |
| Car Smoke Page Transition  | Appearance                                                             |
| Chat                       | App · text channels                                                    |
| Circular Orbit             | Guide                                                                  |
| Code Snippet Deck          | Node                                                                   |
| Combobox                   | People                                                                 |
| Command Menu               | Workspace                                                              |
| Cursor Follower            | Ambience                                                               |
| Date Picker                | Planner                                                                |
| Density Lens               | People                                                                 |
| Dependency Trace           | Node                                                                   |
| Depth Corridor             | Guide                                                                  |
| DirectionalTooltip         | Workspace                                                              |
| Donut Chart                | Node                                                                   |
| Dot Field                  | Ambience                                                               |
| Dot Shader                 | Ambience                                                               |
| Drag to Confirm            | Guide                                                                  |
| DrawCheckbox               | Planner                                                                |
| Dynamic Island             | Home                                                                   |
| Earnings                   | Budget                                                                 |
| Evil Eye                   | Ambience                                                               |
| Expandable Data Row        | People                                                                 |
| Expandable Search          | Home                                                                   |
| FAQ                        | Guide                                                                  |
| Floating Action Dock       | Home                                                                   |
| Focus Mode                 | Home                                                                   |
| Form                       | Planner, Planner, Planner, Planner, Planner, Budget, Budget, Guide     |
| Funnel Chart               | Node                                                                   |
| Glass Navbar               | Workspace                                                              |
| Glitch Text                | Appearance                                                             |
| Glyph Matrix               | Ambience                                                               |
| Gooey Menu                 | Appearance                                                             |
| Gravity Particle Burst     | Appearance                                                             |
| Hamburger Menu             | Workspace                                                              |
| Interactive Area Chart     | Node                                                                   |
| Interactive Timeline       | Node                                                                   |
| Intro Loader               | Appearance                                                             |
| iOS-style Search Bar       | People                                                                 |
| Liquid Ripple Button       | Planner                                                                |
| Liquid Toggle              | Appearance                                                             |
| Live Line Chart            | Node                                                                   |
| Loader                     | Workspace                                                              |
| LockInput                  | Guide                                                                  |
| Login                      | App · returning/imported identities                                    |
| macOS Folder Cards         | Guide                                                                  |
| Magnetic Button            | Home                                                                   |
| Meteors                    | Ambience                                                               |
| Metric HUD                 | Node                                                                   |
| Money Card                 | Budget                                                                 |
| Morphing Blob              | Ambience                                                               |
| Morphing Button            | Planner, Appearance                                                    |
| Morphing Dialog            | Home                                                                   |
| Morphing Icon              | People                                                                 |
| Morphing Mega Menu         | Guide                                                                  |
| Morphing Shape Loader      | Guide                                                                  |
| Neon Edge Button           | Node                                                                   |
| Nimbu Mirchi               | Ambience                                                               |
| Not Found                  | People                                                                 |
| Notification Bell          | Home                                                                   |
| Notification Stack         | Home                                                                   |
| Orbital Loading Ring       | Node                                                                   |
| OriginDropdown             | People                                                                 |
| OTP Input                  | Guide                                                                  |
| Package Box                | Guide                                                                  |
| Particle Delete            | Guide                                                                  |
| Payment Receipt Printer    | Budget                                                                 |
| Payment Status             | Budget                                                                 |
| Peek Card                  | Home                                                                   |
| Photo Box                  | Guide                                                                  |
| Pill Navigation            | Home                                                                   |
| PressButton                | Planner                                                                |
| Pricing                    | Budget                                                                 |
| Product Tour               | Guide                                                                  |
| Profile Card               | People                                                                 |
| Pull to Refresh            | Node                                                                   |
| Rainbow Button             | Home                                                                   |
| Recovery Ledger            | Appearance                                                             |
| Reveal Card                | People                                                                 |
| Rocket Party Popper        | Home                                                                   |
| Scroll Progress Navigation | Guide                                                                  |
| Scroll Velocity Text       | Appearance                                                             |
| Selection Basket           | Planner                                                                |
| SettleModal                | Planner                                                                |
| Sheet                      | Planner, Planner, Planner, Planner, Planner, Planner, Planner, Planner |
| Shooting Stars             | Ambience                                                               |
| Sidebar                    | Workspace                                                              |
| Sign Up                    | App · identity creation                                                |
| Skeleton                   | Workspace, Workspace                                                   |
| SlidePagination            | People                                                                 |
| Small Floating Dock        | Planner                                                                |
| Smart Comparison           | Budget                                                                 |
| Smooth Accordion           | Guide                                                                  |
| Sparkles Core              | Ambience                                                               |
| Speed Warp                 | Ambience                                                               |
| Split Button               | Planner                                                                |
| Spotlight Card             | Home                                                                   |
| Spotlight Search           | Workspace                                                              |
| SpringSelect               | Planner, Budget                                                        |
| Stack Unfold Panel         | People                                                                 |
| Stacked Cards              | Guide                                                                  |
| Stat Card                  | Home                                                                   |
| Stepper                    | Planner                                                                |
| Sticky Pages               | Guide                                                                  |
| Story Cards                | Guide                                                                  |
| StretchSwitch              | Planner, Appearance                                                    |
| Text Scramble Decoder      | Appearance                                                             |
| Thinking Orb               | Guide                                                                  |
| Torque Dial                | Appearance                                                             |
| Typewriter Button          | Appearance                                                             |
| Undo Toast                 | Planner                                                                |
| UnfoldAccordion            | Home                                                                   |
| VelocityToast              | Planner                                                                |
| Wallet Balance             | Budget                                                                 |
| Wallet Card                | Budget                                                                 |
