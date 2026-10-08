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
}

/** The running timer, including the planned block it was started from. */
export interface RunningDTO extends EntryDTO {
  plannedTitle: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
}
