import type { Event, KeyTagPerson } from "../../shared/model";
import { activityAction, actorTag } from "../../shared/activity-identity";
import { Icon } from "./icons";
import { useLanguage } from "./i18n";

export function ActivityActionIcon({ event }: { event: Event }) {
  const action = activityAction(event);
  return (
    <span
      className={`activity-action-icon action-${action}`}
      aria-hidden="true"
    >
      <Icon
        name={
          action === "armed"
            ? "lock"
            : action === "disarmed"
              ? "unlock"
              : action === "partial"
                ? "shield-half"
                : "clock"
        }
        size={17}
      />
    </span>
  );
}

export function ActivityActor({
  event,
  people,
}: {
  event: Event;
  people?: KeyTagPerson[];
}) {
  const { t } = useLanguage();
  const person = actorTag(event.user, people);
  const colors = {
    black: "Black",
    blue: "Blue",
    green: "Green",
    red: "Red",
    yellow: "Yellow",
  };
  const label = person?.color
    ? t("Assigned key tag: {0}", t(colors[person.color]))
    : undefined;
  if (!event.user && !event.channel) return null;
  return (
    <span className="activity-actor">
      <span className="activity-person">
        {person?.color && (
          <span
            className={`key-tag-badge tag-${person.color}`}
            role="img"
            aria-label={label}
            title={label}
          >
            <Icon name="key" size={14} />
          </span>
        )}
        {event.user && (
          <span className="activity-person-name">
            {t("By {0}", event.user)}
          </span>
        )}
      </span>
      {event.channel && (
        <span className="activity-channel">
          {t("Via {0}", t(event.channel))}
        </span>
      )}
    </span>
  );
}
