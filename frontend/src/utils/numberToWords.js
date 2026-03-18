const ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const tens = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function convertHundreds(n) {
  let result = "";

  if (n >= 100) {
    result += ones[Math.floor(n / 100)] + " Hundred";
    n %= 100;
    if (n > 0) result += " ";
  }

  if (n >= 20) {
    result += tens[Math.floor(n / 10)];
    n %= 10;
    if (n > 0) result += "-" + ones[n];
  } else if (n > 0) {
    result += ones[n];
  }

  return result;
}

export default function numberToWords(amount) {
  if (typeof amount !== "number" || isNaN(amount) || amount < 0 || amount > 999999999.99) {
    throw new RangeError("Amount must be a number between 0 and 999,999,999.99");
  }

  const cents = Math.round(amount * 100) % 100;
  const centsStr = String(cents).padStart(2, "0");

  let dollars = Math.floor(Math.round(amount * 100) / 100);

  if (dollars === 0) {
    return `Zero and ${centsStr}/100`;
  }

  const parts = [];

  const millions = Math.floor(dollars / 1000000);
  if (millions > 0) {
    parts.push(convertHundreds(millions) + " Million");
    dollars %= 1000000;
  }

  const thousands = Math.floor(dollars / 1000);
  if (thousands > 0) {
    parts.push(convertHundreds(thousands) + " Thousand");
    dollars %= 1000;
  }

  if (dollars > 0) {
    parts.push(convertHundreds(dollars));
  }

  return `${parts.join(" ")} and ${centsStr}/100`;
}
