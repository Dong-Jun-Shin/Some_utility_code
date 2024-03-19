import axios, { AxiosError } from "axios";

interface Options {
  indent?: string | undefined;
  singleQuotes?: boolean | undefined;
  filter?(input: any, prop: string | symbol): boolean;
  inlineCharacterLimit?: number | undefined;
  transform?: ((input: any[] | object, prop: number | string | symbol, originalResult: string) => string) | undefined;
}

const MAX_LOG_LEN = 600;

function stringifyError(error: Error): string {
  return `${error.message}\n  ${error.stack}`;
}

function stringifyString(k: string, v: string, maxlen = 50): string {
  if (["key", "public", "secret", "private", "password", "auth", "cookie"].find((x) => k.includes(x)))
    return `${v.length > 15 ? `${v.slice(0, 10)}*****` : "*".repeat(Math.min(6, v.length))} (${v.length} chars)`;
  else if (!maxlen) return `${v}`;
  else if (v.length <= maxlen) return `${v}`;
  else return `${v.slice(0, maxlen)} .. (${v.length} chars)`;
}

export async function stringifyObject(object: any, maxlen = 50, indent = 0): Promise<string> {
  // NOTE: stringify-object는 pure-esm이어서 dynamic import 사용
  const dynamicImport = new Function("stringifyObj", "return import(stringifyObj)");
  const stringifyObj = (await dynamicImport("stringify-object")).default as (input: any, options?: Options, pad?: string) => string;

  return (
    `${typeof object === "object" ? `${object.constructor.name || "Object"}: ` : ""}` +
    stringifyObj(object, {
      indent: "  ".repeat(indent + 1),
      inlineCharacterLimit: 64,
      singleQuotes: false,
      transform: (obj: { [x: string]: any }, key: string | number, val: string) => {
        if (typeof obj[key] === "string") return stringifyString(String(key), val, maxlen);
        else return val;
      },
    })
  );
}

const logging = async (notiUrl: string, message: string, messageFull: string) => {
  const { msg } = await (async () => {
    if (messageFull.length <= MAX_LOG_LEN) {
      return { msg: messageFull };
    }

    return { msg: message.slice(0, MAX_LOG_LEN) + " ..." };
  })();

  await axios.request({
    method: "POST",
    url: notiUrl,
    timeout: 1350,
    data: {
      text: msg,
    },
  });
};

export default class Logger {
  private url: string;

  constructor(notiUrl: string) {
    this.url = notiUrl;
  }

  async noti(...args: (Error | object | string)[]) {
    try {
      const url = this.url;
      const message = (
        await Promise.all(
          args.map(async (a, i) => {
            if (a instanceof Error) return stringifyError(a);
            if (typeof a === "object") return (i > 0 ? "\n\n" : "") + (await stringifyObject(a));
            if (typeof a === "string") return a;
            else return String(a);
          })
        )
      ).join(" ");

      if (url) {
        try {
          const messageFull = (
            await Promise.all(
              args.map(async (a, i) => {
                if (a instanceof Error) return stringifyError(a);
                if (typeof a === "object") return (i > 0 ? "\n\n" : "") + (await stringifyObject(a, 0));
                if (typeof a === "string") return a;
                else return String(a);
              })
            )
          ).join(" ");

          await logging(url, message, messageFull).catch((e: AxiosError) => {
            // eslint-disable-next-line no-console
            console.error("Logger Error", e);
          });
        } catch (notiErr) {
          throw notiErr;
        }
      } else {
        console.log(message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }
}
