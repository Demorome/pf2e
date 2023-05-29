import * as R from "remeda";
import { ErrorPF2e, tupleHasValue } from "./misc.ts";

class UUIDUtils {
    /** A replacement for core fromUuidSync that returns cached compendium documents. Remove in v11. */
    static fromUuidSync(uuid: string, relative?: ClientDocument): ClientDocument | CompendiumIndexData | null {
        if (game.release.generation === 10) {
            const { doc, embedded } = this.#parseUuid(uuid, relative);
            if (doc) {
                if (embedded.length) {
                    return _resolveEmbedded(doc, embedded) ?? null;
                }
                return doc;
            }
        }
        return fromUuidSync(uuid, relative);
    }

    /** Retrieve multiple documents by UUID */
    static async fromUUIDs(uuids: string[]): Promise<ClientDocument[]> {
        uuids = R.uniq(uuids);
        const documentsAndIndexData = uuids.flatMap((u) => fromUuidSync(u) ?? []);
        const worldDocs = documentsAndIndexData.filter(
            (d): d is ClientDocument => d instanceof foundry.abstract.Document
        );
        const indexEntries = documentsAndIndexData.filter(
            (d): d is CompendiumIndexData => !tupleHasValue(worldDocs, d)
        );
        const packs = R.uniq(indexEntries.flatMap((e) => game.packs.get(e.pack ?? "") ?? []));
        const packDocs = (
            await Promise.all(
                packs.map(async (pack) => {
                    const ids = indexEntries.filter((e) => e.pack === pack.metadata.id).map((e) => e._id);
                    const cacheHits = ids.flatMap((id) => pack.get(id) ?? []);
                    const cacheMisses = ids.filter((id) => !cacheHits.some((i) => i._id === id));
                    const fromServer =
                        cacheMisses.length > 0 ? await pack.getDocuments({ _id: { $in: cacheMisses } }) : [];

                    return [cacheHits, fromServer].flat();
                })
            )
        ).flat();

        return R.sortBy([...worldDocs, ...packDocs], (d) => uuids.indexOf(d.uuid));
    }

    static #parseUuid(uuid: string, relative?: ClientDocument): ResolvedUUID {
        const resolved = _parseUuid(uuid, relative);
        if (resolved.collection) {
            resolved.doc = resolved.collection.get(resolved.documentId) ?? null;
        }
        return resolved;
    }

    static isItemUUID(uuid: unknown): uuid is ItemUUID {
        if (typeof uuid !== "string") return false;
        if (/^(?:Actor\.[a-zA-Z0-9]{16}\.)?Item\.[a-zA-Z0-9]{16}$/.test(uuid)) {
            return true;
        }

        const [type, scope, packId, id]: (string | undefined)[] = uuid.split(".");
        if (type !== "Compendium") return false;
        if (!(scope && packId && id)) throw ErrorPF2e(`Unable to parse UUID: ${uuid}`);

        const pack = game.packs.get(`${scope}.${packId}`);
        return pack?.documentName === "Item";
    }

    static isTokenUUID(uuid: unknown): uuid is TokenDocumentUUID {
        return typeof uuid === "string" && /^Scene\.[A-Za-z0-9]{16}\.Token\.[A-Za-z0-9]{16}$/.test(uuid);
    }
}

export { UUIDUtils };
