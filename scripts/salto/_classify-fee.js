function classifyFee(feeText) {
  if (!feeText) return { fee_type: 'unknown', fee_amount_eur: null };
  const t = feeText.toLowerCase().trim();
  if (['n/a', 'na', 'none', 'none.', 'no', '0', '-', '.', '0€', '0 €', 'free', 'not the case'].includes(t)) {
    return { fee_type: 'free', fee_amount_eur: null };
  }
  const freeMarkers = [
    'no participation fee', 'no fee', 'free of charge', 'fully funded',
    'fully covered', 'erasmus+ programme', 'erasmus+ youth', 'no costs',
    'no cost for participants', 'is financed by', 'is funded by',
    "don't expect a participation fee", 'do not expect a participation fee',
    "don't expect a fee", 'all costs are covered', 'all costs covered',
    'fully reimbursed', 'no contribution',
    'does not have a participation fee', 'no participation free', // typo común "free" por "fee"
    'none for us',
  ];
  const paidMarkers = [
    'participation fee:', 'participation fee is', 'fee of', 'cost of',
    'price:', 'we charge', 'fee per', 'financial contribution',
    'sliding scale',
  ];
  let amount = null;
  // Acepta "40 €", "40€", "40 EUR", "€40", "EUR 40"
  const m1 = feeText.match(/(\d{2,5})\s*(?:€|eur|euro)/i);
  const m2 = feeText.match(/(?:€|eur|euro)\s*(\d{2,5})/i);
  if (m1) amount = parseInt(m1[1], 10);
  else if (m2) amount = parseInt(m2[1], 10);
  let isFree = freeMarkers.some((k) => t.includes(k));
  let isPaid = paidMarkers.some((k) => t.includes(k));
  if (amount && amount > 0) isPaid = true;
  if (isFree && !isPaid) return { fee_type: 'free', fee_amount_eur: null };
  if (isPaid && !isFree) return { fee_type: 'paid', fee_amount_eur: amount };
  if (isFree && isPaid) return { fee_type: 'mixed', fee_amount_eur: amount };
  return { fee_type: 'unknown', fee_amount_eur: amount };
}

module.exports = { classifyFee };
