import { openLink } from "../telegram";

const URL = "https://lyceedata.com";

/** Quiet attribution line. Rendered as a real anchor so it still works (and
 *  still looks like a link) outside Telegram; inside Telegram the click is
 *  handed to the client, which opens it in the in-app browser. */
export function PoweredBy() {
  return (
    <p className="powered">
      Powered by{" "}
      <a
        href={URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (openLink(URL)) e.preventDefault();
        }}
      >
        Lycee
      </a>
    </p>
  );
}
