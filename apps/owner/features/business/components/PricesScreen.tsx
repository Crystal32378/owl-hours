'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';
import './businessScreens.css';

import { useRef, useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ArrowLeft, Plus } from 'lucide-react';
import { Owl } from '../../../shared/mascot/Owl';
import owlStatic from '../../../shared/mascot/owl/static';
import type { ExtraFee, FeeInput, PriceItem } from '../../../shared/data/types.ts';
import { completeFees, editableFees, fixedFees, isCompleteFee } from '../lib/feeDraft';
import { priceAmountText, priceLabelText } from '../lib/priceFields';
import { isValidPrice } from '../lib/priceValidation';
import { pricesCopys } from '../copys/pricesCopys';
import FeeEditor from './FeeEditor';

export default function PricesScreen(props: {
  prices: PriceItem[];
  fees: ExtraFee[];
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  onSave: (prices: PriceItem[], fees: FeeInput[]) => Promise<boolean>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [drafts, setDrafts] = useState<DraftPrice[]>(() => props.prices.map(toDraft));
  const [feeDrafts, setFeeDrafts] = useState(() => editableFees(props.fees));
  const addedCount = useRef(0);
  const canSave = drafts.length > 0 && drafts.every(isDraftValid) && feeDrafts.every(isCompleteFee);

  function updateDraft(id: string, patch: Partial<DraftPrice>) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }

  function addPrice() {
    addedCount.current += 1;
    const id = `p-added-${addedCount.current}`;
    setDrafts((current) => [...current, { id, label: "", amount: 0, from: false, isNew: true }]);
  }

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={pricesCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
            <Heading level={1}>{pricesCopys.pricesTitle}</Heading>
          </HStack>
          <Text type="supporting">{pricesCopys.pricesLead}</Text>
          <Card padding={4}>
            {drafts.length === 0 ? (
              <EmptyState title="" icon={<Owl src={owlStatic} scale={0.6} clip />} />
            ) : (
              <VStack gap={0}>
                {drafts.map((draft, index) => (
                  <PriceRow
                    key={draft.id}
                    draft={draft}
                    isFirst={index === 0}
                    onLabelChange={(label) => updateDraft(draft.id, { label })}
                    onAmountChange={(amount) => updateDraft(draft.id, { amount })}
                  />
                ))}
              </VStack>
            )}
          </Card>
          <div className="zukki-row-action">
            <Button
              label={pricesCopys.addPrice}
              variant="ghost"
              size="lg"
              icon={<Plus size={20} />}
              onClick={addPrice}
            />
          </div>
          <Text type="label">{pricesCopys.extraFees}</Text>
          <FeeEditor drafts={feeDrafts} fixed={fixedFees(props.fees)} onChange={setFeeDrafts} />
          <div className="zukki-sticky-footer">
            <Button
              label={pricesCopys.save}
              variant="primary"
              size="lg"
              width="100%"
              isDisabled={!canSave}
              onClick={() => props.onSave(drafts.map(toPrice), completeFees(feeDrafts))}
            />
          </div>
        </VStack>
      </div>
    </Theme>
  );
}

type DraftPrice = { id: string; label: string; amount: number; from: boolean; isNew: boolean };

function toDraft(price: PriceItem): DraftPrice {
  return { id: price.id, label: price.label, amount: price.amount, from: price.from, isNew: false };
}

function toPrice(draft: DraftPrice): PriceItem {
  return { id: draft.id, label: draft.label.trim(), amount: draft.amount, from: draft.from };
}

function isDraftValid(draft: DraftPrice): boolean {
  return draft.label.trim() !== "" && isValidPrice(draft.amount);
}

// Existing rows keep the design's static labels; an added row names itself.
function PriceRow(props: {
  draft: DraftPrice;
  isFirst: boolean;
  onLabelChange: (label: string) => void;
  onAmountChange: (amount: number) => void;
}) {
  const { draft } = props;
  return (
    <VStack gap={0}>
      {!props.isFirst && <Divider />}
      <div className="zukki-price-row">
        {draft.isNew ? (
          <TextInput
            label={pricesCopys.newPriceName}
            isLabelHidden
            placeholder={pricesCopys.newPriceName}
            value={draft.label}
            onChange={props.onLabelChange}
          />
        ) : (
          <Text type="body">{priceLabelText(draft)}</Text>
        )}
        <NumberInput
          label={draft.isNew ? pricesCopys.newPriceName : priceLabelText(draft)}
          isLabelHidden
          value={draft.amount}
          onChange={props.onAmountChange}
          isIntegerOnly
          width={120}
          formatValue={priceAmountText}
        />
      </div>
    </VStack>
  );
}

