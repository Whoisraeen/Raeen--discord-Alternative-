import { lazy, Suspense, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Command,
  Home,
  Palette,
  Search,
  Server,
  Users,
  Wallet,
} from 'lucide-react';
import { MotionConfig } from 'framer-motion';
import * as E from './shell-ui';
import { useDialogFocus } from './useDialogFocus';
import type { Screen, WorkspaceProps } from './shared';
import './workspace.css';
const screens = {
  home: lazy(() => import('./Home')),
  people: lazy(() => import('./People')),
  planner: lazy(() => import('./Planner')),
  node: lazy(() => import('./Node')),
  budget: lazy(() => import('./Budget')),
  appearance: lazy(() => import('./Appearance')),
  guide: lazy(() => import('./Guide')),
};
const navigation = [
  { id: 'home', label: 'Overview', icon: <Home size={16} /> },
  { id: 'people', label: 'People', icon: <Users size={16} /> },
  { id: 'planner', label: 'Planner', icon: <CalendarDays size={16} /> },
  { id: 'node', label: 'Your node', icon: <Server size={16} /> },
  { id: 'budget', label: 'Hosting budget', icon: <Wallet size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'guide', label: 'Field guide', icon: <BookOpen size={16} /> },
];
export default function Workspace(props: WorkspaceProps) {
  useDialogFocus();
  const [screen, setScreen] = useState<Screen>('home');
  const [palette, setPalette] = useState(false),
    [commands, setCommands] = useState(false);
  const [mobile, setMobile] = useState(false);
  const View = screens[screen];
  const goto = (id: string) => {
    setScreen(id as Screen);
    setMobile(false);
  };
  return (
    <MotionConfig reducedMotion="user">
      <div className="community-hub easy-ui">
        <E.GlassNavbar
          brand={
            <span className="hub-brand">
              ✳ <b>{props.boot.node.name}</b>
            </span>
          }
          brandHref="#"
          variant="full-width"
          sticky={false}
          items={[]}
          cta={
            <div className="hub-tools">
              <E.HamburgerMenu
                className="hub-mobile-trigger"
                isOpen={mobile}
                onChange={setMobile}
                label="Workspace navigation"
              />
              <E.DirectionalTooltip content="Search channels">
                <button aria-label="Find a channel" onClick={() => setPalette(true)}>
                  <Search size={17} />
                </button>
              </E.DirectionalTooltip>
              <button aria-label="Workspace commands" onClick={() => setCommands(true)}>
                <Command size={17} />
              </button>
              <E.Button variant="ghost" size="sm" onClick={props.onReturn}>
                <ArrowLeft size={14} /> Back to chat
              </E.Button>
            </div>
          }
        />
        <div className="hub-body">
          <E.Sidebar
            className="hub-nav"
            sections={[{ title: 'YOUR SPACE', items: navigation }]}
            activeId={screen}
            onActiveChange={goto}
            mobileOpen={mobile}
            onMobileOpenChange={setMobile}
            header={<span className="hub-nav-label">THE COMMON GROUND</span>}
            footer={<span className="hub-nav-label">Open source. Community owned.</span>}
          />
          <div className="hub-scroll" id="hub-scroll">
            <E.Breadcrumb
              items={[
                { label: props.boot.node.name },
                { label: navigation.find((n) => n.id === screen)!.label },
              ]}
            />
            <E.AnimatedTabs
              tabs={navigation}
              activeTab={screen}
              onChange={goto}
              renderContent={false}
              layoutId="workspace-tabs"
              className="hub-mobile-tabs"
            />
            <Suspense
              fallback={
                <div className="hub-loading">
                  <E.Skeleton className="h-32 w-full rounded-2xl" />
                  <E.Loader label="Opening workspace" />
                  <E.SkeletonText lines={3} />
                </div>
              }
            >
              <View {...props} />
            </Suspense>
          </div>
        </div>
        <E.SpotlightSearch
          open={palette}
          onOpenChange={setPalette}
          enableGlobalShortcut={false}
          placeholder="Jump to a community channel…"
          items={props.boot.channels.map((c) => ({
            id: c.id,
            title: c.name,
            category: c.kind,
            description: c.topic,
            action: () => props.onChannel(c),
          }))}
        />
        <E.CommandMenu
          isOpen={commands}
          onClose={() => setCommands(false)}
          items={navigation.map((n) => ({
            id: n.id,
            title: n.label,
            category: 'Navigation',
            icon: n.icon,
            onSelect: () => {
              goto(n.id);
              setCommands(false);
            },
          }))}
        />
      </div>
    </MotionConfig>
  );
}
