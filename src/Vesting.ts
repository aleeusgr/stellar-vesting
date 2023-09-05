import { Address, Datum, TxOutput, Value} from "@hyperionbt/helios";
import { StellarContract, redeem, datum, txn } from "../lib/StellarContract.js";
import contract from "./Vesting.hl";
import { StellarTxnContext } from "../lib/StellarTxnContext";
import {expect} from "vitest";

import {ADA} from "../lib/StellarTestHelper";

export type VestingParams = {
    sponsor: WalletEmulator;
    payee: Address;
    deadline: bigint;
};

export type VestingDatumArgs = {
    sponsor: PubKeyHash;
    payee: PubKeyHash;
    time: number | bigint;
};

export class Vesting extends StellarContract<VestingParams> {
    contractSource() {
        return contract;
    }
    @datum
    mkDatum({
        sponsor,
        payee,
	time
    }: VestingDatumArgs): InlineDatum {
        //!!! todo: make it possible to type these datum helpers more strongly
        const t = new this.configuredContract.types.Datum(
            sponsor.bytes,
	    payee.bytes,
            time
        );
        return Datum.inline(t._toUplcData());
    }
    @txn
    async mkTxnDepositValueForVesting(
	    // deadline -> [(deadlineA, 0.5),(deadlineB,0.5)]
        { sponsor, payee, deadline }: VestingParams,
        tcx: StellarTxnContext = new StellarTxnContext()
    ): Promise<StellarTxnContext | never> {
	    	const margin = 5n * ADA; // a bug, wip
		const inUtxo = (await sponsor.utxos)[0];
		const inUtxoFee = (await sponsor.utxos)[1];

		const lockedVal = inUtxo.value; // Value
		
		// need to research contract parametrization
		const validatorAddress = Address.fromValidatorHash(this.compiledContract.validatorHash)

		// should be unique for each UTxO:
		const inlineDatum = this.mkDatum({
			sponsor: sponsor.address.pubKeyHash,
			payee: payee.pubKeyHash,
			time: deadline
		});

		tcx.addInput(inUtxo)
		   .addInput(inUtxoFee)
		   // has to be one of this for each maturation option
		   .addOutput(new TxOutput(validatorAddress, lockedVal, inlineDatum))
                   .addOutput(
                    new TxOutput(
                        sponsor.address,
                        new Value(inUtxoFee.value.lovelace - margin)
                    )
                );
	return tcx
    }
    @txn
    async mkTxnClaimVesting(
	sponsor: WalletEmulator,
	valUtxo: UTxO,
	validFrom: bigint, // TODO: assess alternative implementations
        tcx: StellarTxnContext = new StellarTxnContext()
    ): Promise<StellarTxnContext | never> {
		const r = new this.configuredContract.types.Redeemer.Claim();
		const valRedeemer = r._toUplcData();

		const collateralUtxo = (await sponsor.utxos)[0];
		const feeUtxo = (await sponsor.utxos)[1];

		const validTill = validFrom + 1000n;

		tcx.addInput(feeUtxo)
		   .addInput(valUtxo, valRedeemer)
		   .addOutput(new TxOutput(sponsor.address, valUtxo.value))

		   .attachScript(this.compiledContract)
		   .addCollateral(collateralUtxo);

		tcx.tx.addSigner(sponsor.address.pubKeyHash);
		tcx.tx.validFrom(validFrom);
		tcx.tx.validTo(validTill);

		return tcx
    }

    @txn
    async mkTxnCancelVesting(
	sponsor: WalletEmulator,
	valUtxo: UTxO,
	validFrom: bigint, // TODO: assess alternative implementations
        tcx: StellarTxnContext = new StellarTxnContext()
    ): Promise<StellarTxnContext | never> {
		const r = new this.configuredContract.types.Redeemer.Cancel();
		const valRedeemer = r._toUplcData();

		const collateralUtxo = (await sponsor.utxos)[0];
		const feeUtxo = (await sponsor.utxos)[1];

		const validTill = validFrom + 1000n;

		tcx.addInput(feeUtxo)
		   .addInput(valUtxo, valRedeemer)
		   .addOutput(new TxOutput(sponsor.address, valUtxo.value))

		   .attachScript(this.compiledContract)
		   .addCollateral(collateralUtxo);

		tcx.tx.addSigner(sponsor.address.pubKeyHash);
		tcx.tx.validFrom(validFrom);
		tcx.tx.validTo(validTill);

		return tcx
    }
    requirements() {
        return {
            mkTxnDepoGM: {
		// Principle: Code should make sense to a reader
                purpose: "allows (pavel | sasha) to initiate partial withdrawals",
                details: [
                // descriptive details of the requirement (not the tech):
		],
                mech: [
                // descriptive details of the chosen mechanisms for implementing the reqts:
			// a map : Date[] -> Amt[]
			// parse a list of utxos
		],
                requires: [
		// The vision for 'requires' is that it should link to another top-level reqts key.
			"Sasha can deposit to multiple utxos",
			"can process a list of inputs",
			"mkTxnClaim",
			"mkTxnCancel",
		],
            },
            mkTxnCancel: {
                purpose: "can cancel vesting",
                details: [
                // descriptive details of the requirement (not the tech):
		],
                mech: [
                // descriptive details of the chosen mechanisms for implementing the reqts:
		],
                requires: [
			"can find the correct utxo",
			"can serialize the Redeemer",
			"can access currentSlot",
		],
            },
            mkTxnClaim: {
                purpose: "can claim vested funds",
                details: [
                // descriptive details of the requirement (not the tech):
		],
                mech: [
                // descriptive details of the chosen mechanisms for implementing the reqts:
		],
                requires: [
			"can find the correct utxo",
			"can serialize the Redeemer",
			"can access currentSlot",
		],
            },
            mkDatum: {
                purpose: "uses contract parameters to produce a serialized Datum",
                details: [
                // descriptive details of the requirement (not the tech):
			// a Datum factory. Should provide convinient way to change Datum with changing reqts
		],
                mech: [
                // descriptive details of the chosen mechanisms for implementing the reqts:

// https://github.com/donecollectively/coco/blob/0370e87f4b9f1b6891935aebf9117224c61bb973/src/CommunityTreasury.ts#L120C28-L120C58
//     const t = new this.configuredContract.types.Datum.CharterToken(
//         trustees,
//         minSigs
//     );
//     return Datum.inline(t._toUplcData());
// }
// https://github.com/donecollectively/coco/blob/0370e87f4b9f1b6891935aebf9117224c61bb973/src/CommunityTreasury.hl#L7-L9
// enum Datum {
//    CharterToken {
//	    trustees: []Address
//	    minSigs: Int
//    }}
// But I have:
// struct Datum {
//     creator: PubKeyHash
//     beneficiary: PubKeyHash
//     deadline: Time
// }
		],
                requires: [
			"can find sponsor PubKeyHash",
			"can find payee PubKeyHash",
		],
            },
            mkTxDeposit: {
                purpose: "provide a utxo for Cancel and Claim inputs",
                details: [
		],
                mech: [
			// tx builder goes by hand;
			// TODO: automate and type Value.
			// Let tx builder consume a type compatible with Wallet and WalletEmulator
			// user story: amazon-like shopping cart - tina adds tokens from her wallet, then it finds utxos to make up the requested Value.
			// TODO: automate gradual maturation:
			// deadline -> deadlines[]
			// Value -> slices[]
		],
                requires: [
			"can find Sponsor utxo",
			"can create (inline) Datum" , 
			"knows correct validatorAddress"
		],
            },
            foo: {
		// Principle: Code should make sense to a reader
                purpose: "",
                details: [
                // descriptive details of the requirement (not the tech):
		],
                mech: [
                // descriptive details of the chosen mechanisms for implementing the reqts:
		],
                requires: [
		// The vision for 'requires' is that it should link to another top-level reqts key.
		],
            },
        };
    }
}
