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

export function activityAction(event: Pick<Event, "type">) {
  const type = event.type.toLowerCase().replace(/[-_\s]/g, "");
  switch (type) {
    case "outputactivated":
      return "plug-on";
    case "outputdeactivated":
      return "plug-off";
    case "disarmed":
    case "disarmedandunlock":
    case "disarmedannex":
      return "disarmed";
    case "partialarmed":
    case "armedpartial":
    case "partialarmedandlock":
      return "partial";
    case "armed":
    case "armedtotal":
    case "armedandlock":
    case "armedannex":
      return "armed";
    default:
      return "other";
  }
}
export function activityCategory(event: Event) {
  const action = activityAction(event);
  if (action === "plug-on" || action === "plug-off") return "plug";
  if (action !== "other") return "arming";
  if (/battery|internet|mains|supervis/i.test(event.type)) return "health";
  if (/alarm|panic|tamper/i.test(event.type)) return "incidents";
  return "other";
}

export function matchesActivityFilter(event: Event, filter: string) {
  if (filter === "all") return true;
  const category = activityCategory(event);
  return filter === "alarm"
    ? category === "arming" ||
        category === "incidents" ||
        /arming_fail/i.test(event.type)
    : category === filter;
}
