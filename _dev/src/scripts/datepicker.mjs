const storedDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

const padDatePart = value => String(value).padStart(2, '0')

export const parseStoredDate = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.match(storedDatePattern)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

export const serializePickedDate = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return ''
  }

  return [
    String(value.getFullYear()).padStart(4, '0'),
    padDatePart(value.getMonth() + 1),
    padDatePart(value.getDate()),
  ].join('-')
}
