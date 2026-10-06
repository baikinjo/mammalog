import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarMonths,
  calendarDaysBetween,
  completedCalendarMonths,
  localDateId,
} from "../lib/calendar-date";

test("moves whole calendar months and clamps a missing day to the end of the month", () => {
  assert.equal(addCalendarMonths("2026-05-20", 6), "2026-11-20");
  assert.equal(addCalendarMonths("2026-12-15", 6), "2027-06-15", "across a year");
  assert.equal(addCalendarMonths("2026-03-31", 6), "2026-09-30", "a 30-day month");
  assert.equal(addCalendarMonths("2026-08-31", 6), "2027-02-28", "February");
  assert.equal(addCalendarMonths("2027-08-31", 6), "2028-02-29", "February of a leap year");
  assert.equal(addCalendarMonths("2028-02-29", 12), "2029-02-28");
});

test("only real YYYY-MM-DD calendar dates are accepted", () => {
  for (const value of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-5-20", "2026-05-20T00:00", "", "20260520"]) {
    assert.equal(addCalendarMonths(value, 6), null, value);
    assert.equal(calendarDaysBetween(value, "2026-11-20"), null, value);
    assert.equal(completedCalendarMonths(value, "2026-11-20"), null, value);
  }
});

test("counts calendar days across daylight-saving changes without shifting a day", () => {
  // US daylight saving ends on 2026-11-01 and starts on 2027-03-14; a 24-hour count would be off by an hour there.
  assert.equal(calendarDaysBetween("2026-10-30", "2026-11-03"), 4);
  assert.equal(calendarDaysBetween("2027-03-12", "2027-03-16"), 4);
  assert.equal(calendarDaysBetween("2026-11-20", "2026-11-13"), -7);
  assert.equal(calendarDaysBetween("2028-02-28", "2028-03-01"), 2, "leap day included");
  assert.equal(localDateId(new Date(2026, 10, 1, 0, 30)), "2026-11-01");
  assert.equal(localDateId(new Date(2026, 10, 1, 23, 30)), "2026-11-01");
});

test("a month is complete on the same day of a later month, or on its last day when that month is shorter", () => {
  assert.equal(completedCalendarMonths("2026-05-20", "2026-11-19"), 5);
  assert.equal(completedCalendarMonths("2026-05-20", "2026-11-20"), 6);
  assert.equal(completedCalendarMonths("2026-08-31", "2027-02-27"), 5);
  assert.equal(completedCalendarMonths("2026-08-31", "2027-02-28"), 6);
  assert.equal(completedCalendarMonths("2027-08-31", "2028-02-28"), 5);
  assert.equal(completedCalendarMonths("2027-08-31", "2028-02-29"), 6);
  assert.equal(completedCalendarMonths("2026-05-20", "2026-05-01"), 0, "never negative");
});
