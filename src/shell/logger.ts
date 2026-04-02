import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

let configured = false;

export async function setupLogger() {
  if (configured) return;
  configured = true;
  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: ({ category, message }) => {
          const prefix = category.length > 1
            ? `[${category.join(":")}]`
            : `[${category[0]}]`;
          return `${prefix} ${message.join("")}`;
        },
      }),
    },
    loggers: [
      { category: "onegai", sinks: ["console"], lowestLevel: "info" },
    ],
  });
}

export function getOnegaiLogger(...sub: string[]) {
  return getLogger(["onegai", ...sub]);
}
