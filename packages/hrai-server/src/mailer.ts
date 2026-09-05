/**
 * Outbound mail, of which this server sends exactly one kind: a password reset link.
 *
 * The deployment is a machine in someone's home, which usually has no mail relay. Rather
 * than failing there, an unconfigured server writes the link to its own log, so an adult
 * with access to the box can still hand it over. Set HRAI_SMTP_URL to send real mail.
 */
import { createTransport, type Transporter } from "nodemailer";

const SMTP_URL = process.env.HRAI_SMTP_URL ?? "";
const MAIL_FROM = process.env.HRAI_MAIL_FROM ?? "hrai@localhost";

let transport: Transporter | null = null;

/**
 * Whether real mail can leave this server.
 * @returns True when an SMTP relay is configured.
 */
export function mailConfigured(): boolean {
    return SMTP_URL !== "";
}

function transporter(): Transporter {
    transport ??= createTransport(SMTP_URL);
    return transport;
}

function resetBody(displayName: string, link: string): string {
    return [
        `Ahoj ${displayName},`,
        "",
        "někdo požádal o nové heslo k tvému profilu HRAI.",
        "Nové heslo si nastavíš tady:",
        link,
        "",
        "Odkaz platí jednu hodinu a dá se použít jen jednou.",
        "Pokud jsi o nové heslo nežádal/a, nic nedělej — heslo zůstane stejné.",
    ].join("\n");
}

/**
 * Sends the reset link, or logs it when no relay is configured.
 * @param to Recovery address.
 * @param displayName Whose profile it is, for the greeting.
 * @param link The reset URL.
 */
export async function sendPasswordReset(to: string, displayName: string, link: string): Promise<void> {
    if (!mailConfigured()) {
        console.warn(
            `hrai: no HRAI_SMTP_URL configured; password reset link for ${to}: ${link}`,
        );
        return;
    }
    await transporter().sendMail({
        from: MAIL_FROM,
        to,
        subject: "Nové heslo k HRAI",
        text: resetBody(displayName, link),
    });
}
