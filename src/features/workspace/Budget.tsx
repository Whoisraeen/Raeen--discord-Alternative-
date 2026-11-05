import { useState } from 'react';
import { Wallet } from 'lucide-react';
import * as E from './budget-ui';
import { Panel, download, type WorkspaceProps, useLocal } from './shared';
type Entry = { id: string; title: string; amount: number; date: string };
export default function Budget(p: WorkspaceProps) {
  const [entries, setEntries] = useLocal<Entry[]>(`raeen-budget:${p.boot.node.id}`, []),
    [limit, setLimit] = useLocal(`raeen-budget-limit:${p.boot.node.id}`, 0);
  const [title, setTitle] = useState(''),
    [amount, setAmount] = useState(''),
    [kind, setKind] = useState('cost'),
    [last, setLast] = useState<Entry | null>(null);
  const income = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0),
    cost = -entries.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0),
    balance = income - cost;
  const add = (label: string, n: number) => {
    const e = {
      id: crypto.randomUUID(),
      title: label,
      amount: Math.round(n * 100) / 100,
      date: new Date().toISOString(),
    };
    setEntries((current) => [e, ...current]);
    setLast(e);
  };
  const exportLedger = () =>
    download(
      'raeen-hosting-budget.json',
      JSON.stringify({ monthlyTarget: limit, currency: 'USD', entries }, null, 2),
    );
  const dollars = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);
  return (
    <div className="hub-page">
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">A SMALL PLACE. A CLEAR PLAN.</span>
          <h1>Keep your hosting sustainable.</h1>
          <p>
            A private, manual budget in USD. Stored on this device. No bank connection or payment processing.
          </p>
        </div>
        <E.Button onClick={exportLedger}>Export records</E.Button>
      </div>
      <E.Alert tone="info">
        <E.AlertTitle>Local planning only</E.AlertTitle>
        <E.AlertDescription>
          Recording a contribution or cost changes this ledger only. It does not charge, pay, or notify
          anyone.
        </E.AlertDescription>
      </E.Alert>
      <div className="hub-grid two">
        <Panel title="Record what comes in and goes out">
          <E.Form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(amount);
              if (!title.trim() || !Number.isFinite(n) || n <= 0) return;
              add(title.trim(), kind === 'cost' ? -n : n);
              setTitle('');
              setAmount('');
            }}
          >
            <div className="hub-form-stack">
              <label>
                Description
                <E.Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VPS bill, community contribution…"
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Amount (USD)
                <E.Input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <E.SpringSelect
                label="Entry type"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'cost', label: 'Hosting cost' },
                  { value: 'contribution', label: 'Contribution received' },
                ]}
              />
              <E.Button type="submit">Save local record</E.Button>
            </div>
          </E.Form>
        </Panel>
        <Panel title="The hosting reserve">
          <E.WalletCard
            balance={dollars(balance)}
            cardType="Local ledger"
            cardLastFour=""
            balanceLabel="Recorded contributions minus costs"
            buttonLabel="Export ledger"
            onUseWallet={exportLedger}
          />
          <label className="hub-budget-limit">
            Monthly target (USD)
            <E.Input
              type="number"
              aria-label="Monthly hosting target"
              min="0"
              max="1000000"
              step="0.01"
              value={limit}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) setLimit(n);
              }}
            />
          </label>
        </Panel>
      </div>
      <div className="hub-grid two">
        <Panel title="Your available budget">
          <E.WalletBalance
            totalLabel="Recorded balance"
            accounts={[
              {
                id: 'reserve',
                name: 'Community reserve',
                balance,
                logo: <Wallet />,
                background: '#b5f0c8',
                amountColor: '#173421',
              },
            ]}
          />
        </Panel>
        <Panel title="Recorded costs">
          <E.Earnings
            title="Hosting costs recorded"
            periods={[
              {
                id: 'all',
                label: 'All entries',
                comparison: 'Manual records on this device',
                total: cost,
                trend: entries
                  .filter((e) => e.amount < 0)
                  .reverse()
                  .map((e) => -e.amount),
                sources: entries
                  .filter((e) => e.amount < 0)
                  .map((e) => ({ id: e.id, label: e.title, amount: -e.amount })),
              },
            ]}
            defaultPeriod="all"
          />
        </Panel>
      </div>
      <Panel
        title="Member-attributed records"
        note="Use these controls to record costs and contributions already arranged elsewhere. No messages or money are sent."
      >
        <E.MoneyCard
          user={{ name: p.boot.user.name, avatar: '✳' }}
          balance={balance}
          contacts={p.boot.members.map((m) => ({
            id: m.id,
            name: m.name,
            avatar: m.name.slice(0, 1),
            tint: '#b5f0c8',
          }))}
          transactions={entries.map((e) => ({ ...e, icon: <Wallet /> }))}
          paymentLink=""
          onSend={async (r) => add(`${r.note || 'Cost'} · ${r.contact.name}`, -r.amount)}
          onRequest={async (r) => add(`${r.note || 'Contribution'} · ${r.contact.name}`, r.amount)}
          onViewAll={exportLedger}
        />
      </Panel>
      {last && (
        <div className="hub-grid two">
          <Panel title="Latest entry">
            <E.PaymentStatus
              status="success"
              amount={Math.abs(last.amount)}
              transactionId={last.id}
              date={new Date(last.date)}
              paymentMethod={last.amount < 0 ? 'Manual cost' : 'Manual contribution'}
              last4=""
              merchantName="hosting budget"
              items={[{ name: last.title, price: Math.abs(last.amount) }]}
              onDownloadReceipt={exportLedger}
            />
          </Panel>
          <Panel title="Printable planning record">
            <E.PaymentReceiptPrinter
              status="idle"
              merchant={p.boot.node.name}
              merchantSubtext="Local budget record — no payment made"
              orderNumber={last.id.slice(0, 8)}
              date={new Date(last.date)}
              items={[{ name: last.title, price: Math.abs(last.amount) }]}
              total={Math.abs(last.amount)}
              paymentMethod="Manual local record"
              message="For personal planning. This is not proof of payment."
              showStatusCard={false}
              autoPrint={false}
            />
          </Panel>
        </div>
      )}
      <Panel title="Choose how to run your community">
        <E.Pricing
          eyebrow="HOSTING CHOICES"
          heading="The software is yours."
          subheading="Infrastructure costs are paid to your chosen provider. Raeen managed hosting is not available in this MVP."
          freeTier={{
            name: 'Self-host',
            tagline: 'On hardware you control.',
            price: '$0',
            cadence: 'Software license',
            features: ['Open-source node', 'SQLite message history', 'Bring your own LiveKit server'],
            ctaLabel: 'Open node settings',
            onCtaClick: p.onSettings,
          }}
          proTier={{
            name: 'Your hosting budget',
            tagline: 'A planning target you choose.',
            price: dollars(limit),
            cadence: 'Your monthly target',
            features: ['Choose your own provider', 'Manage your own backups', 'Pay your provider separately'],
            ctaLabel: 'Export your plan',
            onCtaClick: exportLedger,
          }}
        />
        <E.SmartComparison
          plans={[
            {
              id: 'home',
              name: 'Home server',
              tagline: 'Use your own hardware',
              price: 'Your costs',
              onCtaClick: p.onSettings,
              ctaText: 'Node settings',
            },
            {
              id: 'vps',
              name: 'Your VPS',
              tagline: 'Choose a provider',
              price: 'Provider pricing',
              onCtaClick: exportLedger,
              ctaText: 'Export budget',
            },
          ]}
          categories={[
            {
              id: 'ownership',
              title: 'Things to plan for',
              features: [
                {
                  id: 'hardware',
                  name: 'Hardware upkeep',
                  values: { home: 'You maintain it', vps: 'Provider maintains it' },
                },
                {
                  id: 'network',
                  name: 'Network setup',
                  values: { home: 'HTTPS and reachable ports', vps: 'HTTPS and firewall rules' },
                },
                {
                  id: 'data',
                  name: 'Backups',
                  values: { home: 'Your responsibility', vps: 'Your responsibility' },
                },
              ],
            },
          ]}
        />
      </Panel>
      {!entries.length && (
        <p className="hub-empty">No financial history is prefilled. Add your own records to begin.</p>
      )}
    </div>
  );
}
