function partsToRecord(parts) {
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function formatDateInTimezone(value, timezone) {
  const parts = partsToRecord(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(value)),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTimeInTimezone(value, timezone) {
  const parts = partsToRecord(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value)),
  );

  return (
    `${parts.year}-${parts.month}-${parts.day} `
    + `${parts.hour}:${parts.minute}:${parts.second}`
  );
}
