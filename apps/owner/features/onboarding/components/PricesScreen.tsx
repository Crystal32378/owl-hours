'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import { useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Check, Pencil } from 'lucide-react';
import type { ExtraFee, FeeInput, PriceItem } from '../../../shared/data/types';
import FeeEditor from '../../business/components/FeeEditor';
import { completeFees, editableFees, fixedFees } from '../../business/lib/feeDraft';
import { onboardingCopys } from '../copys/onboardingCopys';
import { completePrices } from '../lib/priceDraft';
import { priceAmountText } from '../lib/priceText';
import OnboardingFrame from './OnboardingFrame';
import SetupStepHeader from './SetupStepHeader';
import ZukkiSays from './ZukkiSays';

// Setup step 2: the prices found on the website and adding one, then the extra fees
// (FeeEditor). Rows are label/value pairs; the edit button switches a row to TextInputs
// for label and amount, local to the DOM screen, until Continue saves both drafts.
export default function PricesScreen(props: {
  prices: PriceItem[];
  fees: ExtraFee[];
  insets: { top: number; bottom: number };
  onSave: (prices: PriceItem[], fees: FeeInput[]) => Promise<void>;
  onBack: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [draft, setDraft] = useState(props.prices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feeDrafts, setFeeDrafts] = useState(() => editableFees(props.fees));

  return (
    <OnboardingFrame
      insets={insets}
      onBack={() => props.onBack()}
      footerLabel={onboardingCopys.continueButton}
      onFooter={() => saveCompletePrices()}
    >
      <SetupStepHeader step={2} />
      <Heading level={1}>{onboardingCopys.pricesTitle}</Heading>
      <ZukkiSays owl="running" text={onboardingCopys.pricesLead} tone="card" />
      <Card padding={2}>
        {draft.map((price) =>
          editingId === price.id ? (
            <div key={price.id} style={editRowStyle}>
              <div style={editFieldsStyle}>
                <TextInput
                  label={price.label === "" ? onboardingCopys.addPrice : price.label}
                  isLabelHidden
                  value={price.label}
                  onChange={(label) => setLabel(price.id, label)}
                />
                <TextInput
                  label={priceAmountText(price)}
                  isLabelHidden
                  value={price.amount === 0 ? "" : String(price.amount)}
                  onChange={(amount) => setAmount(price.id, amount)}
                />
              </div>
              <IconButton
                label={onboardingCopys.editAction}
                icon={<Check size={18} />}
                variant="ghost"
                onClick={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div key={price.id} style={rowStyle}>
              <span style={labelStyle}>{price.label}</span>
              <span style={amountStyle}>{priceAmountText(price)}</span>
              <IconButton
                label={onboardingCopys.editAction}
                icon={<Pencil size={18} />}
                variant="ghost"
                onClick={() => setEditingId(price.id)}
              />
            </div>
          ),
        )}
      </Card>
      <div>
        <Button label={onboardingCopys.addPrice} variant="ghost" size="lg" icon={<PlusIcon />} onClick={() => addRow()} />
      </div>
      <Text type="label">{onboardingCopys.extraFees}</Text>
      <FeeEditor drafts={feeDrafts} fixed={fixedFees(props.fees)} onChange={setFeeDrafts} />
    </OnboardingFrame>
  );

  // The stack keeps this screen mounted behind step 3, so Back must show what was saved.
  function saveCompletePrices() {
    const complete = completePrices(draft);
    const fees = completeFees(feeDrafts);
    setDraft(complete);
    setFeeDrafts(fees);
    setEditingId(null);
    return props.onSave(complete, fees);
  }

  // A new price opens in edit mode, never as a dead "$0" row.
  function addRow() {
    const id = `p_new_${draft.length + 1}`;
    setDraft([...draft, { id, label: "", amount: 0, from: false }]);
    setEditingId(id);
  }

  function setLabel(id: string, label: string) {
    setDraft(draft.map((price) => (price.id === id ? { ...price, label } : price)));
  }

  function setAmount(id: string, text: string) {
    const digits = text.replace(/\D/g, "");
    setDraft(draft.map((price) => (price.id === id ? { ...price, amount: digits === "" ? 0 : Number(digits) } : price)));
  }
}

// The "+" mark from the handoff (OwPricesSetup.dc.html), drawn inline.
function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const rowStyle = { display: "flex", alignItems: "center", gap: 12, minHeight: 52, paddingInline: 12 } as const;

const labelStyle = { flex: 1, fontSize: 16 } as const;

const amountStyle = { fontSize: 16, fontWeight: 600 } as const;

const editRowStyle = { display: "flex", alignItems: "center", gap: 12, padding: 12 } as const;

const editFieldsStyle = { flex: 1, display: "flex", flexDirection: "column", gap: 8 } as const;
