import {
    Address,
    Datum,
    MintingPolicyHash,
    TxId,
    TxOutput,
    UTxO,
    Value,
} from "@hyperionbt/helios";
import { DefaultMinter, SeedTxnParams } from "../src/DefaultMinter.js";
import {
    Activity,
    StellarConstructorArgs,
    StellarContract,
    datum,
    isActivity,
    paramsBase,
    partialTxn,
    stellarSubclass,
    txn,
} from "./StellarContract.js";
import { InlineDatum, valuesEntry } from "./HeliosPromotedTypes.js";
import { StellarTxnContext } from "./StellarTxnContext.js";

export type seedUtxoParams = {
    seedTxn: TxId;
    seedIndex: bigint;
};
// P extends paramsBase = SC extends StellarContract<infer PT> ? PT : never

interface hasUUTCreator {
    txnCreatingUUTs(tcs: StellarTxnContext, uutPurposes: string[]): Promise<Value>;
}

export type MintCharterRedeemerArgs = {
    owner: Address;
};
export type MintUUTRedeemerArgs = {
    seedTxn: TxId;
    seedIndex: bigint | number;
    purposes: string[];
};

export interface MinterBaseMethods extends hasUUTCreator {
    get mintingPolicyHash(): MintingPolicyHash;
    txnMintingCharterToken(
        tcx: StellarTxnContext,
        owner: Address,
        tVal: valuesEntry
    ): Promise<StellarTxnContext>;
}

export type anyDatumArgs = Record<string, any>;

export abstract class Capo<
        minterType extends MinterBaseMethods & DefaultMinter = DefaultMinter
    >
    extends StellarContract<SeedTxnParams>
    implements hasUUTCreator
{
    constructor(
        args: StellarConstructorArgs<
            StellarContract<SeedTxnParams>,
            SeedTxnParams
        >
    ) {
        super(args);

        const { Datum, Redeemer } = this.configuredContract.types;

        const { CharterToken } = Datum;
        const { updatingCharter, usingAuthority } = Redeemer;

        if (!CharterToken)
            throw new Error("Datum must have a 'CharterToken' variant");
        if (!updatingCharter)
            throw new Error("Redeemer must have a 'updatingCharter' variant");
        if (!usingAuthority)
            throw new Error("Redeemer must have a 'usingAuthority' variant");
    }
    abstract contractSource(): string;
    abstract mkDatumCharterToken(args: anyDatumArgs) : InlineDatum;
    // abstract txnMustUseCharterUtxo(
    //     tcx: StellarTxnContext,
    //     newDatum?: InlineDatum
    // ): Promise<UTxO | never>;

    get minterClass(): stellarSubclass<DefaultMinter, seedUtxoParams> {
        return DefaultMinter;
    }

    minter?: minterType;

    @Activity.partialTxn
    async txnCreatingUUTs(
        tcx: StellarTxnContext,
        uutPurposes: string[]
    ): Promise<Value> {
        return this.minter!.txnCreatingUUTs(tcx, uutPurposes);
    }

    @Activity.redeemer
    protected usingAuthority() : isActivity {
        const r = this.configuredContract.types.Redeemer;
        const { usingAuthority } = r;
        if (!usingAuthority) {
            throw new Error(
                `invalid contract without a usingAuthority redeemer`
            );
        }
        const t = new usingAuthority();

        return {redeemer: t._toUplcData() }
    }

    @Activity.redeemer
    protected updatingCharter({
        trustees,
        minSigs,
    }: {
        trustees: Address[];
        minSigs: bigint;
    }) : isActivity {
        const t = new this.configuredContract.types.Redeemer.updatingCharter(
            trustees,
            minSigs
        );

        return {redeemer: t._toUplcData() }
    }

    tvCharter() {
        return this.minter!.tvCharter()
    }

    get charterTokenAsValue() {
        console.warn("deprecated get charterTokenAsValue; use tvCharter() instead")
        return this.tvCharter()
    }

    @txn
    async mkTxnMintCharterToken(
        datumArgs: anyDatumArgs,
        tcx: StellarTxnContext = new StellarTxnContext()
    ): Promise<StellarTxnContext | never> {
        console.log(`minting charter from seed ${this.paramsIn.seedTxn.hex.substring(0, 12)}…@${this.paramsIn.seedIndex}`);

        return this.mustGetContractSeedUtxo().then((seedUtxo) => {
            const v = this.tvCharter()
            
            const datum = this.mkDatumCharterToken(datumArgs);
            const outputs = [new TxOutput(this.address, v, datum)];

            tcx.addInput(seedUtxo).addOutputs(outputs);
            return this.minter!.txnMintingCharterToken(tcx, this.address);
        });
    }
    get charterTokenPredicate() {
        const predicate = this.mkTokenPredicate(this.tvCharter())

        return predicate
    }

    async mustFindCharterUtxo() {
        const predicate = this.mkTokenPredicate(this.tvCharter())

        return this.mustFindMyUtxo(
            "charter", predicate,
            "has it been minted?"
        )
    }

    @partialTxn  // non-activity partial
    async txnMustUseCharterUtxo(
        tcx: StellarTxnContext,
        redeemer: isActivity,
        newDatum?: InlineDatum
    ): Promise<StellarTxnContext | never> {
        return this.mustFindCharterUtxo().then((ctUtxo: UTxO) => {
            tcx.addInput(
                ctUtxo,
                redeemer.redeemer
            ).attachScript(this.compiledContract);

            const datum = newDatum || (ctUtxo.origOutput.datum as InlineDatum);

            this.txnKeepCharterToken(tcx, datum);
            return tcx
        });
    }


    @partialTxn  // non-activity partial
    async txnUpdateCharterUtxo(
        tcx: StellarTxnContext,
        redeemer: isActivity,
        newDatum: InlineDatum
    ): Promise<StellarTxnContext| never> {
        // this helper function is very simple.  Why have it?  
        //   -> its 3rd arg is required,
        //   -> and its name gives a more specific meaning.
        return this.txnMustUseCharterUtxo(tcx, redeemer, newDatum );
    }

    @partialTxn  // non-activity partial
    txnKeepCharterToken(tcx: StellarTxnContext, datum: InlineDatum) {
        
        tcx.addOutput(
            new TxOutput(this.address, this.tvCharter(), datum)
        );

        return tcx;
    }

    @partialTxn
    async txnAddAuthority(tcx: StellarTxnContext) {
        return this.txnMustUseCharterUtxo(tcx, this.usingAuthority())
    }


    //! it can provide minter-targeted params through getMinterParams()
    getMinterParams() {
        return this.paramsIn;
    }

    getContractParams(params: SeedTxnParams) {
        const { mph } = this;
        // console.log("this treasury uses mph", mph?.hex);

        return {
            mph,
        };
    }

    get mph() {
        const minter = this.connectMintingScript(this.getMinterParams());
        return minter.mintingPolicyHash!;
    }

    get mintingPolicyHash() {
        return this.mph;
    }

    connectMintingScript(params: SeedTxnParams): minterType {
        if (this.minter) return this.minter;
        const { minterClass } = this;
        const { seedTxn, seedIndex } = this.paramsIn;

        const minter = this.addScriptWithParams(minterClass, params);
        const { mintingCharterToken, mintingUUTs } =
            minter.configuredContract.types.Redeemer;
        if (!mintingCharterToken)
            throw new Error(
                `minting script doesn't offer required 'mintingCharterToken' activity-redeemer`
            );
        if (!mintingUUTs)
            throw new Error(
                `minting script doesn't offer required 'mintingUUTs' activity-redeemer`
            );

        //@ts-ignore-error - can't seem to indicate to typescript that minter's type can be relied on to be enough
        return (this.minter = minter);
    }

    async mustGetContractSeedUtxo(): Promise<UTxO | never> {
        //! given a Capo-based contract instance having a free UTxO to seed its validator address,
        //! prior to initial on-chain creation of contract,
        //! it finds that specific UTxO in the current user's wallet.
        const { seedTxn, seedIndex } = this.paramsIn;
        console.log(`seeking seed txn ${seedTxn.hex.substring(0, 12)}…@${seedIndex}`);

        return this.mustFindActorUtxo(
            "seed",
            (u) => {
                const { txId, utxoIdx } = u;

                if (txId.eq(seedTxn) && BigInt(utxoIdx) == seedIndex) {
                    return u;
                }
            },
            "already spent?"
        );
    }

    capoRequirements() {
        return {
            "is a base class for leader/Capo pattern": {
                purpose:
                    "so that smart contract developers can easily start multi-script development",
                details: [
                    "Instantiating a Capo contract always uses the seed-utxo pattern for uniqueness.",
                    "Subclassing Capo with no type-params gives the default minter,",
                    "  ... which only allows UUTs to be created",
                    "Subclassing Capo<CustomMinter> gives an overloaded minter,",
                    "  ... which must allow UUT minting and may allow more Activities too.",
                ],
                mech: [
                    "provides a default minter",
                    "allows the minter class to be overridden",
                ],
            },
            "can create unique utility tokens": {
                purpose:
                    "so the contract can use UUTs for scoped-authority semantics",
                details: [
                    "Building a txn with a UUT involves using the txnCreatingUUT partial-helper on the Capo.",
                    "That UUT (a Value) is returned, and then should be added to a TxOutput.",
                    "The partial-helper doesn't constrain the semantics of the UUT.",
                    "The UUT uses the seed-utxo pattern to form 64 bits of uniqueness",
                    "   ... so that token-names stay short-ish.",
                    "The uniqueness level can be iterated in future as needed.",
                    "The UUT's token-name combines its textual purpose with a short hash ",
                    "   ... of the seed UTxO, formatted with bech32",
                ],
            },
        };
    }
}
