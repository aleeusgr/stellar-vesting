import {
    Address,
    Assets,
    Datum,
    DatumHash,
    MintingPolicyHash,
    Network,
    NetworkParams,
    Program,
    Tx,
    TxOutput,
    UTxO,
    UplcProgram,
    Value,
    Wallet,
    extractScriptPurposeAndName,
} from "@hyperionbt/helios";
import { StellarTxnContext } from "./StellarTxnContext.js";

type tokenPredicate = ((something: canHaveToken) => boolean) & { value: Value };

type WalletsAndAddresses = {
    wallets: Wallet[];
    addresses?: Address[];
};
export type paramsBase = Record<string, any>;
export type TxInput = Tx["body"]["inputs"][0];
export type tokenNamesOrValuesEntry = [string | number[], bigint];
export type valuesEntry = [number[], bigint];

export function redeem(proto, thingName, descriptor) {
    if (!thingName.match(/ing/)) {
        throw new Error(
            `@redeem factory: ${thingName}: name should have 'ing' in it (or work around with @redeemerData instead)`
        );
    }
    if (thingName.match(/^ing/)) {
        throw new Error(
            `@redeem factory: ${thingName}: name shouldn't start with 'ing'`
        );
    }
    return redeemerData(proto, thingName, descriptor);
}

export function redeemerData(proto, thingName, descriptor) {
    //!!! todo: registry and cross-checking for missing redeeming methods

    //!!! todo: develop more patterns of "redeemer uses an input of a certain mph/value"
    return descriptor;
}

export function datum(proto, thingName, descriptor) {
    // console.log("+datum", proto.constructor.name, thingName || "none", descriptor.value.name )
    if (!thingName.match(/^mkDatum/)) {
        throw new Error(
            `@datum factory: ${thingName}: name should start with 'mkDatum...'`
        );
    }
    return descriptor;
}

export function txn(proto, thingName, descriptor) {
    // console.log("+datum", proto.constructor.name, thingName || "none", descriptor.value.name )
    if (!thingName.match(/^mkTxn/)) {
        throw new Error(
            `@txn factory: ${thingName}: name should start with 'mkTxn...'`
        );
    }
    return descriptor;
}

export function partialTxn(proto, thingName, descriptor) {
    // console.log("+datum", proto.constructor.name, thingName || "none", descriptor.value.name )
    if (!thingName.match(/^txn[A-Z]/)) {
        throw new Error(
            `@partialTxn factory: ${thingName}: should start with 'txn[A-Z]...'`
        );
    }
    return descriptor;
}


export function hexToPrintableString(hexStr) {
    let result = "";
    for (let i = 0; i < hexStr.length; i += 2) {
        let hexChar = hexStr.substring(i, i + 2);
        let charCode = parseInt(hexChar, 16);

        // ASCII printable characters are in the range 32 (space) to 126 (~)
        if (charCode >= 32 && charCode <= 126) {
            result += String.fromCharCode(charCode);
        } else {
            result += `‹${hexChar}›`;
        }
    }
    return result;
}
export function assetsAsString(v: any) {
    return Object.entries(v)
        .map(([policyId, tokens]) => {
            const tokenString = Object.entries(tokens as any)
                .map(
                    ([name, count]) =>
                        `${count}×💴 ${hexToPrintableString(name)}`
                )
                .join(" + ");
            return `⦑🏦 ${policyId.substring(0, 12)}… ${tokenString}⦒`;
        })
        .join("\n  ");
}
export function lovelaceToAda(l: bigint | number) {
    const asNum = parseInt(l.toString());
    const ada =
        (asNum && `${(Math.round(asNum / 1000) / 1000).toFixed(3)} ADA`) || "";
    return ada;
}

export function valueAsString(v: Value) {
    const ada = lovelaceToAda(v.lovelace);
    const assets = assetsAsString(v.assets.dump?.() || v.assets);
    return [ada, assets].filter((x) => !!x).join(" + ");
}

export function txAsString(tx: Tx): string {
    const bodyAttrs = [
        "inputs",
        "minted",
        "collateral",
        "outputs",
        "fee",
        "lastValidSlot",
        "firstValidSlot",
        "metadataHash",
        "scriptDataHash",
        "signers",
        "collateralReturn",
        "refInputs",
    ];
    const witnessAttrs = [
        "signatures",
        "datums",
        "refScripts",
        "scripts",
        "redeemers",
        "nativeScripts",
    ];

    let details = "";

    const d = tx.dump();
    //!!! todo: improve interface of tx so useful things have a non-private api
    //!!! todo: get rid of dump()
    //!!! todo: get back to type-safety in this diagnostic suite

    for (const x of bodyAttrs) {
        let item = tx.body[x] || (d.body[x] as any);
        let skipLabel = false;
        // console.log(`attr '${x}'`)
        if (Array.isArray(item) && !item.length) continue;

        if (!item) continue;
        if ("inputs" == x) {
            item = `\n  ${item.map((x) => txInputAsString(x)).join("\n  ")}`;
        }
        if ("collateral" == x) {
            //!!! todo: group collateral with inputs and reflect it being spent either way,
            //     IFF it is also a tx `input`
            //!!! todo: move collateral to bottom with collateralReturn,
            //     IFF it is not part of the tx `inputs`
            item = item.map((x) => txInputAsString(x, "🔪")).join("\n    ");
        }
        if ("minted" == x) {
            const assets = item?.dump();
            if (!Object.entries(assets || {}).length) continue;

            item = ` ❇️  ${assetsAsString(assets)}`;
        }
        if ("outputs" == x) {
            item = `\n  ${item
                .map((x, i) => txOutputAsString(x, `${i}  <-`))
                .join("\n  ")}`;
        }
        if ("signers" == x) {
            item = item.map((x) => {
                if (!x.hex) debugger;
                return `🔑#${x.hex.substring(0, 8)}…`;
            });
        }

        if ("fee" == x) {
            item = parseInt(item);
            item = `${(Math.round(item / 1000) / 1000).toFixed(3)} ADA`;
            // console.log("fee", item)
        }

        if ("collateralReturn" == x) {
            skipLabel = true;
            item = `  ${txOutputAsString(
                item,
                `0  <- ❓`
            )} conditional: collateral change (returned in case of txn failure)`;
        }

        details += `${skipLabel ? "" : "  " + x + ": "}${item}\n`;
    }
    let hasWinfo = false;
    const winfo = {};
    for (const x of witnessAttrs) {
        let item = tx.witnesses[x] || (d.witnesses[x] as any);
        if (Array.isArray(item) && !item.length) continue;
        if ("datums" == x && !Object.entries(item || {}).length) continue;
        if ("signatures" == x) {
            if (!item) continue;
            item = item.map((s) => {
                return `🖊️ ${Address.fromPubKeyHash(s.pubKeyHash)
                    .toBech32()
                    .substring(0, 24)}…`;
            });
            if (item.length > 1) item.unshift("");
            item = item.join("\n    ");
        }
        if ("redeemers" == x) {
            if (!item) continue;
            //!!! todo: augment with mph when that's available from the Redeemer.
            item = item.map(
                (x) =>
                    `🏧  #${
                        x.data.index ? 1 + x.data.index : ""
                    } ${x.data.toString()}`
            );
            if (item.length > 1) item.unshift("");
            item = item.join("\n    ");
        }
        if ("scripts" == x) {
            if (!item) continue;
            item = item.map((s) => {
                try {
                    return `🏦 ${s.mintingPolicyHash.hex.substring(
                        0,
                        12
                    )}… (minting)`;
                } catch (e) {
                    return `📜 ${s.validatorHash.hex.substring(
                        0,
                        12
                    )}… (validator)`;
                }
            });
            if (item.length > 1) item.unshift("");
            item = item.join("\n    ");
        }

        if (!item) continue;
        hasWinfo = true;
        winfo[x] = item;
    }
    if (hasWinfo) {
        details += Object.entries(winfo)
            .map(([k, v]) => `  ${k}: ${v}\n`)
            .join("");
    }
    try {
        details = details + `  txId: ${tx.id().dump()}`;
    } catch (e) {
        details = details + `  (Tx not yet finalized!)`;
    }
    return details;

    // body {
    // inputs,
    // output
    //     "fee": "168581",
    //     "lastValidSlot": null,
    //     "firstValidSlot": null,
    //     "minted": null,
    //     "metadataHash": null,
    //     "scriptDataHash": null,
    //     "collateral": null,
    //     "signers": null,
    //     "collateralReturn": null,
    //     "refInputs": []
    //   },
    //   "witnesses": {
    //     "signatures": [],
    //     "datums": [],
    //     "redeemers": [],
    //     "nativeScripts": [],
    //     "scripts": [],
    //     "refScripts": []
    //   },
    //   "valid": true,
    //   "metadata": null
}
export function txInputAsString(x: TxInput, prefix = "-> "): string {
    return `${prefix}${x.address.toBech32().substring(0, 18)}… ${valueAsString(
        x.value
    )} = 📖 ${x.txId.hex.substring(0, 12)}…@${x.utxoIdx}`;
}

export function utxosAsString(utxos: UTxO[]): string {
    return utxos.map((u) => utxoAsString(u, " 💵")).join("\n");
}

export function utxoAsString(u: UTxO, prefix = "💵"): string {
    return ` 📖 ${u.txId.hex.substring(0, 12)}…@${
        u.utxoIdx
    }: ${txOutputAsString(u.origOutput, prefix)}`; // or 🪙
}

export function datumAsString(d: Datum | undefined): string {
    if (!d) return ""; //"‹no datum›";
    // debugger
    const dhss = d.hash.hex.substring(0, 12);
    if (d.isInline()) return `d‹inline:${dhss}…›`;
    return `d‹hash:${dhss}…›`;
}

export function txOutputAsString(x: TxOutput, prefix = "<-"): string {
    const bech32 = (x.address as any).bech32 || x.address.toBech32();

    return `${prefix} ${bech32.substring(0, 18)}… ${datumAsString(
        x.datum
    )} ${valueAsString(x.value)}`;
}

export async function findInputsInWallets(
    v: Value,
    searchIn: WalletsAndAddresses,
    network: Network
) {
    const { wallets, addresses } = searchIn;

    const lovelaceOnly = v.assets.isZero();
    console.warn("finding inputs", {
        lovelaceOnly,
    });

    for (const w of wallets) {
        const [a] = await w.usedAddresses;
        console.log("finding funds in wallet", a.toBech32().substring(0, 18));
        const utxos = await w.utxos;
        for (const u of utxos) {
            if (lovelaceOnly) {
                if (u.value.assets.isZero() && u.value.lovelace >= v.lovelace) {
                    return u;
                }
                console.log("  - too small; skipping ", u.value.dump());
            } else {
                if (u.value.ge(v)) {
                    return u;
                }
            }
        }
    }
    if (lovelaceOnly) {
        throw new Error(
            `no ADA is present except those on token bundles.  TODO: findFreeLovelaceWithTokens`
        );
        // const spareChange = this.findFreeLovelaceWithTokens(v, w)
    }
    //!!! todo: allow getting free ada from a contract address?

    if (addresses) {
        for (const a of addresses) {
            const utxos = await network.getUtxos(a);
            for (const u of utxos) {
                if (u.value.ge(v)) {
                    return u;
                }
            }
        }
    }

    throw new Error(
        `None of these wallets${
            (addresses && " or addresses") || ""
        } have the needed tokens`
    );
}

export type StellarConstructorArgs<
    SC extends StellarContract<P>,
    P extends paramsBase = SC extends StellarContract<infer P> ? P : never
> = {
    params: P;
    network: Network;
    networkParams: NetworkParams;
    isTest: boolean;
    myself?: Wallet;
};
export type utxoPredicate =
    | ((u: UTxO) => UTxO | undefined)
    | ((u: UTxO) => boolean)
    | ((u: UTxO) => boolean | undefined);

type scriptPurpose =
    | "testing"
    | "minting"
    | "spending"
    | "staking"
    | "module"
    | "linking";

export type canHaveToken = UTxO | TxInput | TxOutput | Assets;

//<CT extends Program>
export class StellarContract<
    // SUB extends StellarContract<any, ParamsType>,
    ParamsType extends paramsBase
> {
    //! it has configuredContract: a parameterized instance of the contract
    //  ... with specific `parameters` assigned.
    configuredContract: Program;
    compiledContract: UplcProgram;
    paramsIn: ParamsType;
    contractParams: paramsBase;
    network: Network;
    networkParams: NetworkParams;
    _template?: Program;
    myself?: Wallet;

    mkContractParams(params) {
        return params;
    }
    constructor({
        params,
        network,
        networkParams,
        isTest,
        myself,
    }: StellarConstructorArgs<StellarContract<ParamsType>, ParamsType>) {
        this.network = network;
        this.networkParams = networkParams;
        this.paramsIn = params;

        this.contractParams = this.mkContractParams(params);
        if (myself) this.myself = myself;

        const configured = (this.configuredContract = this.contractTemplate());

        configured.parameters = this.contractParams;
        const simplify = !isTest;
        this.compiledContract = configured.compile(simplify);

        // const configured = Program.new(source)
        // configured.parameters = params;
        // const compiledContract = configured.compile(simplify)
        // const addr = Address.fromHashes(compiledContract.validatorHash)
    }
    get datumType() {
        return this.configuredContract.types.Datum;
    }
    _purpose?: scriptPurpose;
    get purpose() {
        if (this._purpose) return this._purpose;
        const src = this.contractSource();

        const [purpose, name] = extractScriptPurposeAndName(src) || [];
        return (this._purpose = purpose as scriptPurpose);
    }

    async findInputsInWallets(v: Value, searchIn: WalletsAndAddresses) {
        return findInputsInWallets(v, searchIn, this.network);
    }

    get address(): Address {
        return Address.fromHashes(this.compiledContract.validatorHash);
    }

    get mintingPolicyHash() {
        if ("minting" != this.purpose) return undefined;

        return this.compiledContract.mintingPolicyHash;
    }

    get identity() {
        if ("minting" == this.purpose) {
            const b32 = this.compiledContract.mintingPolicyHash.toBech32();
            return b32.replace(/^asset/, "mph");
        }

        return this.address.toBech32();
    }

    stringToNumberArray(str: string): number[] {
        let encoder = new TextEncoder();
        let byteArray = encoder.encode(str);
        return [...byteArray].map((x) => parseInt(x.toString()));
    }

    mkValuesEntry(tokenName: string, count: bigint): valuesEntry {
        return [this.stringToNumberArray(tokenName), count];
    }

    addScriptWithParams<
        SC extends StellarContract<any>
        // P = SC extends StellarContract<infer P> ? P : never
    >(
        TargetClass: new (
            a: SC extends StellarContract<any>
                ? StellarConstructorArgs<SC>
                : never
        ) => SC,
        params: SC extends StellarContract<infer P> ? P : never
    ) {
        const args: StellarConstructorArgs<SC> = {
            params,
            network: this.network,
            myself: this.myself,
            networkParams: this.networkParams,
            isTest: true,
        };
        //@ts-expect-error todo: why is the conditional type not matching enough?
        const strella = new TargetClass(args);
        return strella;
    }

    async findDatum(d: Datum | DatumHash): Promise<UTxO[]>;
    async findDatum(predicate: utxoPredicate): Promise<UTxO[]>;
    async findDatum(d: Datum | DatumHash | utxoPredicate): Promise<UTxO[]> {
        let targetHash: DatumHash | undefined =
            d instanceof Datum
                ? d.hash
                : d instanceof DatumHash
                ? d
                : undefined;
        let predicate =
            "function" === typeof d
                ? d
                : (u: UTxO) => {
                      const match =
                          u.origOutput?.datum?.hash.hex == targetHash?.hex;
                      console.log(
                          txOutputAsString(
                              u.origOutput,
                              `    ${match ? "✅ matched " : "❌ no match"}`
                          )
                      );
                      return !!match;
                  };

        //prettier-ignore
        console.log(
            `finding utxo with datum ${
                targetHash?.hex.substring(0,12)
            }... in wallet`,
            this.address.toBech32().substring(0,18)
        );

        const heldUtxos = await this.network.getUtxos(this.address);
        console.log(`    - found ${heldUtxos.length} utxo:`);
        return heldUtxos.filter(predicate);
    }

    _mkTokenPredicate(
        vOrMph: Value | MintingPolicyHash,
        tokenName?: string,
        quantity?: bigint
    ): tokenPredicate {
        let v: Value;

        if (!vOrMph)
            throw new Error(
                `missing required Value or MintingPolicyHash in arg1`
            );
        const predicate = _tokenPredicate.bind(this) as tokenPredicate;

        const isValue = !(vOrMph instanceof MintingPolicyHash);
        if (isValue) {
            v = predicate.value = vOrMph;
            return predicate;
        }
        if (!tokenName || !quantity)
            throw new Error(
                `missing required tokenName, quantity for this mph`
            );

        const mph = vOrMph;
        v = predicate.value = this.tokenAsValue(tokenName, quantity, mph);
        return predicate;

        function _tokenPredicate(
            this: StellarContract<ParamsType>,
            something: canHaveToken
        ) {
            return this.hasToken(something, v);
        }
    }

    hasToken(
        something: canHaveToken,
        vOrMph: Value | MintingPolicyHash,
        tokenName?: string,
        quantity?: bigint
    ) {
        if (something instanceof UTxO)
            return this.utxoHasToken(something, vOrMph, tokenName, quantity);
        if (something instanceof TxOutput)
            return this.outputHasToken(something, vOrMph, tokenName, quantity);
        if (something instanceof Assets)
            return this.assetsHasToken(something, vOrMph, tokenName, quantity);

        //!!! todo: more explicit match for TxInput, which seems to be a type but not an 'instanceof'-testable thing.
        return this.inputHasToken(something, vOrMph, tokenName, quantity);
    }

    utxoHasToken(
        u: UTxO,
        vOrMph: Value | MintingPolicyHash,
        tokenName?: string,
        quantity?: bigint
    ) {
        return this.outputHasToken(u.origOutput, vOrMph, tokenName, quantity);
    }
    inputHasToken(
        i: TxInput,
        vOrMph: Value | MintingPolicyHash,
        tokenName?: string,
        quantity?: bigint
    ) {
        return this.outputHasToken(i.origOutput, vOrMph, tokenName, quantity);
    }

    assetsHasToken(
        a: Assets,
        vOrMph: Value | MintingPolicyHash,
        tokenName?: string,
        quantity?: bigint
    ) {
        const v =
            vOrMph instanceof MintingPolicyHash
                ? this.tokenAsValue(tokenName!, quantity!, vOrMph)
                : vOrMph;

        return a.ge(v.assets);
    }

    outputHasToken(
        o: TxOutput,
        vOrMph: Value | MintingPolicyHash,
        tokenName?: string,
        quantity?: bigint
    ) {
        if (vOrMph instanceof MintingPolicyHash && !tokenName)
            throw new Error(
                `missing required tokenName (or use a Value in arg2`
            );
        if (vOrMph instanceof MintingPolicyHash && !quantity)
            throw new Error(
                `missing required quantity (or use a Value in arg2`
            );

        const v =
            vOrMph instanceof MintingPolicyHash
                ? this.tokenAsValue(tokenName!, quantity!, vOrMph)
                : vOrMph;

        return o.value.ge(v);
    }

    tokenAsValue(
        tokenName: string,
        quantity: bigint,
        mph?: MintingPolicyHash
    ): Value {
        if (!mph) {
            mph = (this as any).mph;
            if (!mph)
                throw new Error(
                    `tokenAsValue: mph in arg3 required unless the stellar contract (${this.constructor.name}) has an 'mph' getter.`
                );
        }

        const v = new Value(
            this.ADA(0),
            new Assets([
                [mph, [[this.stringToNumberArray(tokenName), quantity]]],
            ])
        );
        const o = new TxOutput(this.address, v);
        v.setLovelace(o.calcMinLovelace(this.networkParams));

        return v;
    }

    async findAnySpareUtxos(): Promise<UTxO[] | never> {
        if (!this.myself) throw this.missingActorError;

        type tempInfo = {
            u: UTxO;
            sufficient: boolean;
            free: bigint;
            reserved: bigint;
        };
        const smallerAndNonReserved = (
            { free: free1, reserved: r1 }: tempInfo,
            { free: free2, reserved: r2 }: tempInfo
        ) => {
            {
                //! primary: treats non-reserved utxos as always better
                if (!r1 && r2) {
                    return -1;
                }
                if (r1 && !r2) {
                    return 1; //
                }
            }
            //! secondary: smaller utxos are more preferred than larger ones
            if (free2 > free1) return 1;
            if (free2 < free1) return -1;
            return 0;
        };
        const countAdaOnly = (c: number, { reserved }: tempInfo): number => {
            return c + (reserved ? 0 : 1);
        };

        const notReserved = ({ reserved }: tempInfo) => !reserved;
        const isSufficient = ({ sufficient }: tempInfo) => !!sufficient;
        const backToUtxo = ({ u }: tempInfo) => u;

        const toSortInfo = (u: UTxO): tempInfo => {
            const reserved = u.origOutput.calcMinLovelace(this.networkParams);
            const free = u.value.lovelace - reserved;
            const sufficient = free < this.ADA(10) && free > this.ADA(2);
            return { u, sufficient, free, reserved };
        };

        return this.myself.utxos.then((utxos) => {
            const allSpares = utxos
                .map(toSortInfo)
                .filter(isSufficient)
                .sort(smallerAndNonReserved);

            if (allSpares.reduce(countAdaOnly, 0) > 0) {
                return allSpares.filter(notReserved).map(backToUtxo);
            }
            return allSpares.map(backToUtxo);
        });
    }

    async submit(
        tcx: StellarTxnContext,
        {
            sign = true,
            signers = [],
        }: {
            sign?: boolean;
            signers?: Wallet[];
        } = {}
    ) {
        let { tx } = tcx;
        if (this.myself || signers.length) {
            const [a] = (await this.myself?.usedAddresses) || [];
            const spares = await this.findAnySpareUtxos();
            const willSign = [...signers];
            if (sign && this.myself) {
                willSign.push(this.myself);
            }
            for (const s of willSign) {
                const [a] = await s.usedAddresses;
                tx.addSigner(a.pubKeyHash);
            }
            try {
                // const t1 = new Date().getTime();
                await tx.finalize(this.networkParams, a, spares);
            } catch (e) {
                console.log("FAILED submitting:", tcx.dump());
                throw e;
            }
            for (const s of willSign) {
                const sig = await s.signTx(tx);
                tx.addSignatures(sig, true);
            }
        } else {
            console.warn("no 'myself'; not finalizing");
        }
        console.log("Submitting tx: ", tcx.dump());

        return this.network.submitTx(tx);
    }

    ADA(n: bigint | number): bigint {
        const bn =
            "number" == typeof n
                ? BigInt(Math.floor(1_000_000 * n))
                : ((BigInt(1_000_000) * n) as bigint);
        return bn;
    }

    //! it requires an subclass to define a contractSource
    contractSource(): string | never {
        throw new Error(`missing contractSource impl`);
    }

    //!!! todo: implement more and/or test me:
    async findFreeLovelaceWithTokens(v: Value, w: Wallet) {
        const utxos = await w.utxos;
        const lovelaceOnly = v.assets.isZero();
        //! it finds free lovelace in token bundles, if it can't find free lovelace otherwise
        if (lovelaceOnly) {
            let maxFree: UTxO, minToken: UTxO;
            let minPolicyCount = Infinity;

            for (const u of utxos) {
                const policies = u.value.assets.mintingPolicies.length;
                if (policies < minPolicyCount) {
                    minPolicyCount = policies;
                    minToken = u;
                }

                const free =
                    u.value.lovelace -
                    u.origOutput.calcMinLovelace(this.networkParams);
                //@ts-ignore
                if (!maxFree) {
                    maxFree = u;
                } else if (free > maxFree!.value.lovelace) {
                    maxFree = u;
                }
            }
        }
    }

    // static withParams(this: new () => StellarContract, params: any) : never | StellarContract {
    //     throw new Error(`subclass must implement static withParams`);
    //     // return new this(params)
    // }
    // constructor(params: any) {

    // }
    contractTemplate() {
        const src = this.contractSource();
        // console.log({src, Program)

        return (this._template = this._template || Program.new(src));
    }

    async getMyActorAddress() {
        if (!this.myself) throw this.missingActorError;

        const [addr] = await this.myself.usedAddresses;

        return addr;
    }

    private get missingActorError(): string | undefined {
        return `missing required 'myself' property on ${this.constructor.name} instance`;
    }

    async mustFindActorUtxo(
        name: string,
        predicate: (u: UTxO) => UTxO | undefined,
        extraErrorHint: string = ""
    ): Promise<UTxO | never> {
        const address = await this.getMyActorAddress();

        return this.mustFindUtxo(name, predicate, { address }, extraErrorHint);
    }

    async hasActorUtxo(
        name: string,
        predicate: (u: UTxO) => UTxO | undefined,
        extraErrorHint: string = ""
    ): Promise<UTxO | undefined> {
        const address = await this.getMyActorAddress();

        return this.hasUtxo(name, predicate, { address });
    }

    async mustFindMyUtxo(
        name: string,
        predicate: (u: UTxO) => UTxO | undefined,
        extraErrorHint: string = ""
    ): Promise<UTxO | never> {
        const { address } = this;
        return this.mustFindUtxo(name, predicate, { address }, extraErrorHint);
    }

    async mustFindUtxo(
        name: string,
        predicate: (u: UTxO) => UTxO | undefined,
        { address }: { address: Address },
        extraErrorHint: string = ""
    ): Promise<UTxO | never> {
        const found = await this.hasUtxo(name, predicate, { address });
        if (!found) {
            throw new Error(
                `${this.constructor.name}: '${name}' utxo not found (${extraErrorHint}) in address`
            );
        }

        return found;
    }

    async hasUtxo(
        name: string,
        predicate: utxoPredicate,
        { address }: { address: Address }
    ): Promise<UTxO | undefined> {
        const utxos = await this.network.getUtxos(address);
        console.log(`finding '${name}' utxo in set: `, utxosAsString(utxos));

        return utxos.find(predicate);
    }

    async hasMyUtxo(
        name: string,
        predicate: utxoPredicate
    ): Promise<UTxO | undefined> {
        return this.hasUtxo(name, predicate, { address: this.address });
    }
}