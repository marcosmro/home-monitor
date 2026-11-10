import type { Event, KeyTagPerson } from "./model";

export function keyTagPeople(raw: unknown): KeyTagPerson[] {
  if (!Array.isArray(raw)) throw new Error("People response not recognized.");
  return raw.flatMap((person) => {
    if (!person || typeof person !== "object") return [];
    const firstName = person.FirstName ?? person.firstName;
    const lastName = person.LastName ?? person.lastName;
    const color = person.Tag?.Color ?? person.tag?.color;
    if (typeof firstName !== "string" || !firstName.trim()) return [];
    const normalized = typeof color === "string" ? color.toLowerCase() : "";

    return [
      {
        name: [firstName, typeof lastName === "string" ? lastName : ""]
          .filter(Boolean)
          .join(" ")
          .trim(),
        firstName: firstName.trim(),
        color: ["black", "blue", "green", "red", "yellow"].includes(normalized)
          ? (normalized as KeyTagPerson["color"])
          : undefined,
      },
    ];
  });
}

export function actorTag(
  user: string | undefined,
  people: KeyTagPerson[] = [],
) {
  if (!user) return undefined;
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const exact = people.filter(
    (person) => normalize(person.name) === normalize(user),
  );
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const first = people.filter(
    (person) => normalize(person.firstName) === normalize(user),
  );
  return first.length === 1 ? first[0] : undefined;
}

export function activityAction(event: Event) {
  const type = event.type.toLowerCase().replace(/[-_\s]/g, "");
  if (type === "disarmed") return "disarmed";
  if (type === "partialarmed" || type === "armedpartial") return "partial";
  if (type === "armed" || type === "armedtotal") return "armed";
  return "other";
}
