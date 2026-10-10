export interface CategoryDTO {
  id: string;
  name: string;
  color: string;
}

export interface EntryDTO {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  categoryId: string | null;
  note: string | null;
  plannedEventId: string | null;
}

export interface BlockDTO {
  id: string;
  title: string;
  start: Date;
  end: Date;
  htmlLink?: string;
  /** Colour of the Google calendar the block comes from. */
  color?: string;
}

/** A timed event from a "show only" calendar: displayed, not part of the plan. */
export interface ShownDTO {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color?: string;
  htmlLink?: string;
}

/** An all-day event shown as a chip on the day. */
export interface AllDayDTO {
  id: string;
  title: string;
  color?: string;
  htmlLink?: string;
}

/** The running timer, including the planned block it was started from. */
export interface RunningDTO extends EntryDTO {
  plannedTitle: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
}
