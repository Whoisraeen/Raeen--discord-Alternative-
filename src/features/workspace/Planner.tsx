import { useState } from 'react';
import { CalendarDays, Check, Download, Plus, Trash2 } from 'lucide-react';
import * as E from './planner-ui';
import { Panel, download, type WorkspaceProps, useLocal } from './shared';
type Plan = { id: string; title: string; date: string; channel: string; done: boolean; created: string };
export default function Planner(p: WorkspaceProps) {
  const [plans, setPlans] = useLocal<Plan[]>(`raeen-planner:${p.boot.node.id}`, []);
  const [title, setTitle] = useState(''),
    [date, setDate] = useState<Date | null>(new Date()),
    [channel, setChannel] = useState(p.boot.channels[0]?.id ?? '');
  const [step, setStep] = useState(0),
    [showDone, setShowDone] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [details, setDetails] = useState<Plan | null>(null);
  const [deleted, setDeleted] = useState<Plan[]>([]),
    [undo, setUndo] = useState(false),
    [saved, setSaved] = useState(false);
  const visible = plans.filter((x) => showDone || !x.done);
  const remove = (ids: string[]) => {
    setDeleted(plans.filter((x) => ids.includes(x.id)));
    setPlans(plans.filter((x) => !ids.includes(x.id)));
    setSelection([]);
    setUndo(true);
  };
  const save = () => {
    if (!title.trim() || !date) return;
    setPlans([
      ...plans,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        date: date.toISOString(),
        channel,
        done: false,
        created: new Date().toISOString(),
      },
    ]);
    setTitle('');
    setStep(0);
    setSaved(true);
  };
  return (
    <div className="hub-page">
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">MAKE TIME FOR YOUR PEOPLE</span>
          <h1>Something to look forward to.</h1>
          <p>Your private planner. Saved on this device; events are not sent to other members.</p>
        </div>
        <E.SplitButton
          label="Export planner"
          onClick={() => download('raeen-plans.json', JSON.stringify(plans, null, 2))}
          options={[
            {
              value: 'json',
              label: 'Download JSON',
              onSelect: () => download('raeen-plans.json', JSON.stringify(plans, null, 2)),
            },
            {
              value: 'text',
              label: 'Download agenda',
              onSelect: () =>
                download(
                  'raeen-agenda.txt',
                  plans.map((x) => `${new Date(x.date).toLocaleString()} · ${x.title}`).join('\n'),
                  'text/plain',
                ),
            },
          ]}
        />
      </div>
      <Panel title="Find a time across time zones" note="Choose cities where your people live.">
        <E.AirportMatrixClock showSeconds={false} updateInterval={30000} showControls />
      </Panel>
      <div className="hub-grid main-side">
        <Panel title="Plan a get-together">
          <E.Stepper
            current={step}
            onStepChange={setStep}
            steps={[{ title: 'The idea' }, { title: 'The details' }, { title: 'Make a plan' }]}
          />
          <E.Form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) {
                if (title.trim()) setStep(step + 1);
              } else save();
            }}
          >
            <div className="hub-planner-step">
              {step === 0 && (
                <E.FormItem>
                  <E.FormLabel htmlFor="plan-title" required>
                    What are you planning?
                  </E.FormLabel>
                  <E.Input
                    id="plan-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Friday co-op, release party…"
                    maxLength={120}
                    required
                  />
                  <E.FormDescription>A reminder for you, with a link back to your channel.</E.FormDescription>
                </E.FormItem>
              )}
              {step === 1 && (
                <div className="hub-form-stack">
                  <label>
                    Day
                    <E.DatePicker value={date} onChange={setDate} />
                  </label>
                  <label>
                    Time
                    <E.Input
                      aria-label="Event time"
                      type="time"
                      value={
                        date
                          ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                          : '19:00'
                      }
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        if (Number.isFinite(h) && Number.isFinite(m)) {
                          const next = new Date(date ?? Date.now());
                          next.setHours(h, m);
                          setDate(next);
                        }
                      }}
                    />
                  </label>
                  <E.SpringSelect
                    label="Community channel"
                    options={p.boot.channels.map((c) => ({ value: c.id, label: c.name }))}
                    value={channel}
                    onChange={setChannel}
                  />
                </div>
              )}
              {step === 2 && (
                <div className="hub-plan-review">
                  <h3>{title}</h3>
                  <p>
                    {date?.toLocaleString()} · #{p.boot.channels.find((c) => c.id === channel)?.name}
                  </p>
                  <E.DrawCheckbox checked={true} readOnly label="Save privately on this device" />
                </div>
              )}
            </div>
            <div className="hub-action-row">
              {step > 0 && (
                <E.Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                  Back
                </E.Button>
              )}
              <E.PressButton type="submit" disabled={!title.trim() || !date}>
                {step === 2 ? 'Save plan' : 'Continue'} <Plus size={14} />
              </E.PressButton>
            </div>
          </E.Form>
          <E.BranchingSubmenu
            label="Start with an idea"
            items={[
              {
                id: 'play',
                label: 'Get together',
                children: [
                  { id: 'Co-op night', label: 'Co-op night' },
                  { id: 'Community hangout', label: 'Community hangout' },
                ],
              },
              {
                id: 'build',
                label: 'Build together',
                children: [
                  { id: 'Release party', label: 'Release party' },
                  { id: 'Code review', label: 'Code review' },
                ],
              },
            ]}
            onItemSelect={(v) => {
              setTitle(v);
              setStep(0);
            }}
          />
        </Panel>
        <Panel title="Pick your day">
          <E.Calendar value={date} onChange={setDate} />
        </Panel>
      </div>
      <Panel title="Your upcoming plans">
        <div className="hub-action-row">
          <E.StretchSwitch checked={showDone} onChange={setShowDone} label="Include completed plans" />
          <E.MorphingButton
            status={saved ? 'success' : 'idle'}
            idleText="New plan"
            successText="Plan saved"
            onClick={() => {
              setSaved(false);
              setStep(0);
              document.getElementById('plan-title')?.focus();
            }}
          />
        </div>
        {!visible.length && (
          <div className="hub-empty">
            <CalendarDays size={30} />
            <h3>Leave a little room for good company.</h3>
            <p>Add your first plan above.</p>
          </div>
        )}
        <E.BatchGestureTray
          items={visible.map((x) => ({
            id: x.id,
            title: x.title,
            subtitle: new Date(x.date).toLocaleString(),
            icon: <CalendarDays />,
          }))}
          selectedIds={selection}
          onSelectionChange={setSelection}
          actions={[
            {
              id: 'done',
              label: 'Mark complete',
              icon: <Check />,
              action: (ids) => {
                setPlans(plans.map((x) => (ids.includes(x.id) ? { ...x, done: true } : x)));
                setSelection([]);
              },
            },
            {
              id: 'delete',
              label: 'Remove',
              icon: <Trash2 />,
              color: 'danger',
              action: () => setConfirm(true),
            },
          ]}
        />
        <E.SelectionBasket
          mode="inline"
          selectedCount={selection.length}
          totalCount={visible.length}
          onClearSelection={() => setSelection([])}
          onSelectAll={() => setSelection(visible.map((x) => x.id))}
          actions={[
            { id: 'remove', label: 'Remove plans', variant: 'danger', onClick: () => setConfirm(true) },
          ]}
        />
        <div className="hub-plan-list">
          {visible.map((x) => (
            <div className="hub-plan" key={x.id}>
              <E.DrawCheckbox
                checked={x.done}
                onChange={(e) =>
                  setPlans(
                    plans.map((plan) => (plan.id === x.id ? { ...plan, done: e.target.checked } : plan)),
                  )
                }
                label={x.title}
              />
              <span>{new Date(x.date).toLocaleString()}</span>
              <E.Button size="sm" variant="ghost" onClick={() => setDetails(x)}>
                Details
              </E.Button>
            </div>
          ))}
        </div>
      </Panel>
      <E.SettleModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remove selected plans?"
        description="These are private reminders on this device."
        footer={
          <E.Button
            variant="destructive"
            onClick={() => {
              remove(selection);
              setConfirm(false);
            }}
          >
            Remove {selection.length} plans
          </E.Button>
        }
      >
        <p>You can undo this change after removing them.</p>
      </E.SettleModal>
      <E.Sheet
        open={!!details}
        onOpenChange={(v) => {
          if (!v) setDetails(null);
        }}
      >
        <E.SheetContent>
          <E.SheetHeader>
            <E.SheetTitle>{details?.title}</E.SheetTitle>
            <E.SheetDescription>
              Private reminder · {details && new Date(details.date).toLocaleString()}
            </E.SheetDescription>
          </E.SheetHeader>
          <E.SheetBody>
            {details && (
              <>
                <p>
                  Channel: #{p.boot.channels.find((c) => c.id === details.channel)?.name ?? 'Removed channel'}
                </p>
                <E.LiquidRippleButton
                  onClick={() => {
                    const c = p.boot.channels.find((c) => c.id === details.channel);
                    if (c) p.onChannel(c);
                  }}
                >
                  Open channel
                </E.LiquidRippleButton>
              </>
            )}
          </E.SheetBody>
          <E.SheetFooter>
            <E.SheetClose>Close details</E.SheetClose>
          </E.SheetFooter>
        </E.SheetContent>
      </E.Sheet>
      <E.UndoToast
        open={undo}
        title="Plans removed"
        description="Only your local planner changed."
        onUndo={() => {
          setPlans((current) => [...current, ...deleted.filter((d) => !current.some((x) => x.id === d.id))]);
          setUndo(false);
        }}
        onDismiss={() => setUndo(false)}
      />
      <E.VelocityToast
        open={saved}
        onDismiss={() => setSaved(false)}
        title="A little something to look forward to"
        description="Plan saved privately on this device."
        variant="success"
      />
      <E.SmallFloatingDock
        className="hub-contained-dock"
        position="bottom-right"
        items={[
          {
            id: 'new',
            icon: <Plus />,
            label: 'New plan',
            action: () => {
              setStep(0);
              document.getElementById('plan-title')?.focus();
            },
          },
          {
            id: 'export',
            icon: <Download />,
            label: 'Export planner',
            action: () => download('raeen-plans.json', JSON.stringify(plans, null, 2)),
          },
          { id: 'today', icon: <CalendarDays />, label: 'Today', action: () => setDate(new Date()) },
        ]}
      />
    </div>
  );
}
