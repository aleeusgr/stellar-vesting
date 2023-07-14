import {
    Program,
    Datum,
    TxId,
    TxOutputId,
    Address,
    Value,
    TxOutput,
    MintingPolicyHash,
    Assets,
    Crypto,
} from "@hyperionbt/helios";
import {
    Activity,
    StellarContract,
    partialTxn,
} from "../lib/StellarContract.js";

//@ts-expect-error
import contract from "./CustomMinter.hl";
import { StellarTxnContext } from "../lib/StellarTxnContext.js";
import { MintCharterRedeemerArgs, MintUUTRedeemerArgs, MinterBaseMethods } from "../lib/Capo.js";
import { DefaultMinter } from "./DefaultMinter.js";
import { tokenNamesOrValuesEntry, valuesEntry } from "../lib/HeliosPromotedTypes.js";

export type SeedTxnParams = {
    seedTxn: TxId;
    seedIndex: bigint;
};


export class CustomMinter 
extends DefaultMinter
implements MinterBaseMethods {
    contractSource() {
        return contract;
    }

    @Activity.redeemer
    protected mintingNamedToken(v : Value) {
        const t =
            new this.configuredContract.types.Redeemer.mintingNamedToken(v);

        return t._toUplcData();
    }


    async txnMintingNamedToken(
        tcx: StellarTxnContext,
        tokenName: string,
        count: bigint
    ): Promise<StellarTxnContext>;

    async txnMintingNamedToken(
        tcx: StellarTxnContext,
        tokenNamesAndCounts: tokenNamesOrValuesEntry[]
    ): Promise<StellarTxnContext>;

    @Activity.partialTxn
    async txnMintingNamedToken(
        tcx: StellarTxnContext,
        tokenNameOrPairs: string | tokenNamesOrValuesEntry[],
        count?: bigint
    ): Promise<StellarTxnContext> {
        let namesAndCounts: tokenNamesOrValuesEntry[];
        if (!Array.isArray(tokenNameOrPairs)) {
            const tokenName = tokenNameOrPairs;
            if (!count)
                throw new Error(
                    `missing required 'count' arg when using 'tokenName:string' overload`
                );

            namesAndCounts = [[tokenName, count]];
        } else {
            namesAndCounts = tokenNameOrPairs;
        }
        const values: valuesEntry[] = namesAndCounts.map(([name, count]) => {
            if (Array.isArray(name)) return [name, count] as valuesEntry;
            return this.mkValuesEntry(name, count);
        });
        const value  = this._mkMintingValue(values);

        return tcx
            .mintTokens(
                this.mintingPolicyHash!,
                values,
                this.mintingNamedToken(value)
            )
            .attachScript(this.compiledContract);
    }
    private _mkMintingValue(values: valuesEntry[]) {
        return new Value(0, 
            new Assets(
                [[
                    this.mintingPolicyHash, values
                ]]
            )
        );
    }
}