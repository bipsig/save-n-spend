// Format integer paise into an Indian-grouped rupee string.
// Decimals are shown only when there are non-zero paise, so whole amounts stay clean.
//   5240000 -> "₹52,400"   125050 -> "₹1,250.50"   -45000 -> "-₹450"
const formatMoney = (paise: number): string => {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = Math.floor(absPaise / 100);
  const paiseRemainder = absPaise % 100;

  // Indian digit grouping on the rupee part: last 3 digits, then groups of 2.
  const digits = rupees.toString();
  let result = "";
  let slots = 3;
  for (let i = digits.length - 1; i>= 0; i--) {
    if (slots > 0) {
      result = digits [i] + result;
      slots--;
    }
    else {
      result = "," + result;
      i++;
      slots = 2;
    }
  }

  result = "₹" + result;
  if (paiseRemainder > 0) {
    result = result + "." + paiseRemainder.toString().padStart(2, "0");
  }
  if (isNegative) {
    result = "-" + result;
  }

  return result;
}

export const parseMoney = (value: string): number => {
  value = value.replace(/[^0-9.]/g, "");
  const floatedValue = parseFloat(value);
  if (isNaN(floatedValue)) {
    return NaN;
  }
  const paiseValue = Math.round(floatedValue * 100);

  return paiseValue;
}


export default formatMoney;