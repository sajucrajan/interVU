/**
 * The ways of working a new organization starts with (docs/01 §4, Ways of working).
 *
 * Five, not fifteen: an interviewer rates these in the last minutes of a
 * call, and a long list gets the midpoint all the way down. Each is phrased
 * as something you can SEE in an hour, so "team fit" never collapses into
 * "people like me". Admins edit the set on /admin/attributes.
 */
export const DEFAULT_ATTRIBUTES = [
  {
    name: "Communication",
    description: "Explains their thinking so others can follow, and listens.",
    behaviours: [
      "Answers the question that was asked, then stops",
      "Checks they understood before answering something ambiguous",
      "Can explain a technical choice to someone outside their field",
    ],
  },
  {
    name: "Collaboration",
    description: "Works with people rather than around them.",
    behaviours: [
      "Credits others unprompted when describing past work",
      "Takes a push-back as information, not as an attack",
      "Asks what the team has already tried before proposing a change",
    ],
  },
  {
    name: "Ownership",
    description: "Sees things through, including the unglamorous parts.",
    behaviours: [
      "Describes what they did when something went wrong, not only what others did",
      "Mentions the follow-through: the rollout, the handover, the fix after",
      "Names a mistake of their own and what changed because of it",
    ],
  },
  {
    name: "Curiosity",
    description: "Learns on purpose, and is honest about what they don't know.",
    behaviours: [
      "Says \"I don't know\" and then reasons toward an answer",
      "Asks a real question about the role or the team",
      "Can describe something they learned recently and how",
    ],
  },
  {
    name: "Values alignment",
    description: "Would be at home with how this organization makes decisions.",
    behaviours: [
      "Their reasons for leaving and joining are about the work, not only the title",
      "Comfortable with the trade-offs this team actually makes",
      "Treats the people who are not in the room with respect",
    ],
  },
];
