// Датуми по локално време на фармата (Europe/Skopje), независно од временската зона на серверот.
// Серверот работи во UTC; „денес“ по UTC е вчерашен ден меѓу 00:00 и 01:00/02:00 локално.
const TZ = 'Europe/Skopje';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// 'YYYY-MM-DD' за денес (или за даден Date) по локално време
function todayLocal(date = new Date()) {
  return fmt.format(date);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

module.exports = { todayLocal, isValidDateStr };
