import fetch from 'node-fetch';

import { API_ENDPOINT, MAX_EMBED_FIELD_CHARS, MAX_EMBED_FOOTER_CHARS } from "./helpers/discord-helpers.js";
import { createJwt, decodeJwt } from "./helpers/jwt-helpers.js";
import { getBan, isBlocked } from "./helpers/user-helpers.js";

export async function handler(event, context) {
    let payload;

    if (process.env.USE_NETLIFY_FORMS) {
        payload = JSON.parse(event.body).payload.data;
    } else {
        if (event.httpMethod !== "POST") {
            return {
                statusCode: 405
            };
        }

        const params = new URLSearchParams(event.body);
        payload = {
            banReason: params.get("banReason") || undefined,
            appealText: params.get("appealText") || undefined,
            futureActions: params.get("futureActions") || undefined,
            token: params.get("token") || undefined
        };
    }

    if (payload.banReason !== undefined &&
        payload.appealText !== undefined &&
        payload.futureActions !== undefined && 
        payload.token !== undefined) {
        
        const userInfo = decodeJwt(payload.token);
        if (isBlocked(userInfo.id)) {
            return {
                statusCode: 303,
                headers: {
                    "Location": `/error?msg=${encodeURIComponent("Vous ne pouvez pas soumettre de demandes de bannissement avec ce compte Discord.")}`,
                },
            };
        }
        
        const message = {
            embed: {
                title: "Nouvelle demande de débannissement soumise !",
                timestamp: new Date().toISOString(),
                fields: [
                    {
                        name: "Demandeur :",
                        value: `<@${userInfo.id}> (${userInfo.username}#${userInfo.discriminator})`
                    },
                    {
                        name: "Pourquoi avez-vous été bannis ?",
                        value: payload.banReason.slice(0, MAX_EMBED_FIELD_CHARS)
                    },
                    {
                        name: "Pourquoi pensez-vous que vous devriez être débannis ?",
                        value: payload.appealText.slice(0, MAX_EMBED_FIELD_CHARS)
                    },
                    {
                        name: "Que ferez-vous pour éviter d'être banni à l'avenir ?",
                        value: payload.futureActions.slice(0, MAX_EMBED_FIELD_CHARS)
                    }
                ]
            }
        }

        if (process.env.GUILD_ID) {
            try {
                const ban = await getBan(userInfo.id, process.env.GUILD_ID, process.env.DISCORD_BOT_TOKEN);
                if (ban !== null && ban.reason) {
                    message.embed.footer = {
                        text: `Motif initial du bannissement : ${ban.reason}`.slice(0, MAX_EMBED_FOOTER_CHARS)
                    };
                }
            } catch (e) {
                console.log(e);
            }

            if (!process.env.DISABLE_UNBAN_LINK) {
                const unbanUrl = new URL("/.netlify/functions/unban", DEPLOY_PRIME_URL);
                const unbanInfo = {
                    userId: userInfo.id
                };
    
                message.components = [{
                    type: 1,
                    components: [{
                        type: 2,
                        style: 5,
                        label: "Approuver la demande et débannir le demandeur.",
                        url: `${unbanUrl.toString()}?token=${encodeURIComponent(createJwt(unbanInfo))}`
                    }]
                }];
            }
        }

        const result = await fetch(`${API_ENDPOINT}/channels/${encodeURIComponent(process.env.APPEALS_CHANNEL)}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`
            },
            body: JSON.stringify(message)
        });

        if (result.ok) {
            if (process.env.USE_NETLIFY_FORMS) {
                return {
                    statusCode: 200
                };
            } else {
                return {
                    statusCode: 303,
                    headers: {
                        "Location": "/success"
                    }
                };
            }
        } else {
            console.log(JSON.stringify(await result.json()));
            throw new Error("Le message n'a pas pu être envoyé");
        }
    }

    return {
        statusCode: 400
    };
}
