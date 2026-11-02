// Extra fees on the prices screens (onboarding step 2 and Business > Prices):
// each fee shows its name and amount with edit and remove; editing takes a
// name, an amount and the "At night" switch. "At cost" fees are shown as they
// are. The screen owns the drafts and saves them with its own button.
import { useRef, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ExtraFee, FeeInput } from '../../../shared/data/types.ts';
import { canAddFee, hasNoFees } from '../lib/feeDraft';
import { feeAmountText, feeLabelText } from '../lib/priceFields';
import { feesCopys } from '../copys/feesCopys';

export default function FeeEditor(props: {
  drafts: FeeInput[];
  fixed: ExtraFee[];
  onChange: (drafts: FeeInput[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const addedCount = useRef(0);

  return (
    <>
      <Card padding={2}>
        {hasNoFees(props.drafts, props.fixed) ? (
          <div style={emptyStyle}>
            <Text type="supporting">{feesCopys.empty}</Text>
          </div>
        ) : (
          <>
            {props.drafts.map((fee) =>
              editingId === fee.id ? (
                <FeeEditRow key={fee.id} fee={fee} onChange={(patch) => updateFee(fee.id, patch)} onDone={() => setEditingId(null)} />
              ) : (
                <FeeRow key={fee.id} fee={fee} onEdit={() => setEditingId(fee.id)} onRemove={() => removeFee(fee.id)} />
              ),
            )}
            {props.fixed.map((fee) => (
              <div key={fee.id} style={rowStyle}>
                <span style={labelStyle}>{feeLabelText(fee)}</span>
                <span style={amountStyle}>{feeAmountText(fee)}</span>
              </div>
            ))}
          </>
        )}
      </Card>
      {canAddFee(props.drafts) && (
        <div>
          <Button label={feesCopys.addFee} variant="ghost" size="lg" icon={<Plus size={20} />} onClick={addFee} />
        </div>
      )}
    </>
  );

  // A new fee opens in edit mode, never as a dead "+$0" row.
  function addFee() {
    addedCount.current += 1;
    const id = `f-new-${addedCount.current}`;
    props.onChange([...props.drafts, { id, label: '', amount: 0, atNight: false }]);
    setEditingId(id);
  }

  function updateFee(id: string, patch: Partial<FeeInput>) {
    props.onChange(props.drafts.map((fee) => (fee.id === id ? { ...fee, ...patch } : fee)));
  }

  function removeFee(id: string) {
    props.onChange(props.drafts.filter((fee) => fee.id !== id));
  }
}

function FeeRow(props: { fee: FeeInput; onEdit: () => void; onRemove: () => void }) {
  const { fee } = props;
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>
        <span>{fee.label}</span>
        {fee.atNight && <Text type="supporting">{feesCopys.atNight}</Text>}
      </div>
      <span style={amountStyle}>{feeAmountText(fee)}</span>
      <IconButton label={feesCopys.editFee} icon={<Pencil size={18} />} variant="ghost" onClick={props.onEdit} />
      <IconButton label={feesCopys.removeFee} icon={<Trash2 size={18} />} variant="ghost" onClick={props.onRemove} />
    </div>
  );
}

function FeeEditRow(props: { fee: FeeInput; onChange: (patch: Partial<FeeInput>) => void; onDone: () => void }) {
  const { fee } = props;
  return (
    <div style={editRowStyle}>
      <div style={editFieldsStyle}>
        <TextInput
          label={feesCopys.feeName}
          isLabelHidden
          placeholder={feesCopys.feeName}
          value={fee.label}
          onChange={(label) => props.onChange({ label })}
        />
        <TextInput
          label={feesCopys.feeAmount}
          isLabelHidden
          placeholder={feesCopys.feeAmount}
          value={fee.amount === 0 ? '' : String(fee.amount)}
          onChange={(text) => props.onChange({ amount: wholeAmount(text) })}
        />
        <Switch label={feesCopys.atNight} value={fee.atNight} changeAction={(atNight) => props.onChange({ atNight })} />
      </div>
      <IconButton label={feesCopys.doneEditing} icon={<Check size={18} />} variant="ghost" onClick={props.onDone} />
    </div>
  );
}

// The amount field keeps digits only, as the price rows do.
function wholeAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, paddingInline: 12 } as const;

const labelStyle = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', fontSize: 16 } as const;

const amountStyle = { fontSize: 16, fontWeight: 600 } as const;

const editRowStyle = { display: 'flex', alignItems: 'center', gap: 12, padding: 12 } as const;

const editFieldsStyle = { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } as const;

const emptyStyle = { padding: 12 } as const;
