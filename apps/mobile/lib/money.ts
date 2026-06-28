const formatMoney = (amount: number): string => {
  const digits = Math.abs(Math.round(amount)).toString();
  const isNegative = amount < 0;

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
  if (isNegative) {
    result = "-" + result;
  }

  return result;
}


export default formatMoney;