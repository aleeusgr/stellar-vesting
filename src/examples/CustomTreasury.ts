import { seedUtxoParams } from "../../lib/Capo.js";
import { Activity, stellarSubclass, txn } from "../../lib/StellarContract.js";
import { StellarTxnContext } from "../../lib/StellarTxnContext.js";
import { CustomMinter } from "../CustomMinter.js";
import { SampleTreasury, chTok } from "./SampleTreasury.js";

import contract from "./CustomTreasury.hl";

export class CustomTreasury extends SampleTreasury {
    contractSource() {
        return contract;
    }

    get minterClass(): stellarSubclass<CustomMinter, seedUtxoParams> {
        return CustomMinter;
    }
    minter!: CustomMinter

    @Activity.redeemer
    mintingToken(tokenName: string) {
        const t = new this.configuredContract.types.Redeemer.mintingToken(
            tokenName
        );

        return t._toUplcData();
    }

    @txn
    async mkTxnMintNamedToken(
        tokenName: string,
        count: bigint,
        tcx: StellarTxnContext = new StellarTxnContext()
    ): Promise<StellarTxnContext> {
        return this.txnMustUseCharterUtxo(tcx).then(async (charterToken) => {
            tcx.addInput(
                charterToken[chTok],
                this.mintingToken(tokenName)
            ).attachScript(this.compiledContract);

            return this.minter!.txnMintingNamedToken(
                tcx,
                tokenName,
                count
            );
        });
    }
}