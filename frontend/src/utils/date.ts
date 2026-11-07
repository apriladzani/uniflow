/** Format a local calendar date without converting it through UTC. */
export const localDateKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Format a local wall-clock timestamp without converting it through UTC. */
export const localDateTimeValue = (date: Date = new Date()): string =>
  `${localDateKey(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

/** Parse a MySQL DATETIME as a local wall-clock timestamp, never as UTC. */
export const parseLocalDateTime = (value: string): Date => {
  const [datePart, timePart = '00:00:00'] = value.replace('T', ' ').split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours = 0, minutes = 0, secondsPart = '0'] = timePart.split(':');
  const [seconds, milliseconds = '0'] = secondsPart.split('.');
  return new Date(year, month - 1, day, Number(hours), Number(minutes), Number(seconds), Number(milliseconds.padEnd(3, '0').slice(0, 3)));
};
