import {
    describe as descrWithContext,
    expect,
    it as itWithContext,
    beforeEach,
    vi,
} from "vitest";

import {
    SampleTreasury,
    CharterDatumArgs,
    chTok,
} from "../src/examples/SampleTreasury";

import {
    Address,
    Datum,
    Value,
    Tx,
    TxOutput
} from "@hyperionbt/helios";

import { StellarTxnContext } from "../lib/StellarTxnContext";

import {
    ADA,
    StellarTestContext, 
    StellarCapoTestHelper,
    HelperFunctions,
    addTestContext,
    mkContext,
} from "../lib/StellarTestHelper"; //HeliosTestingContext

import {
    VestingParams,
    Vesting,
} from "../src/Vesting";

const it = itWithContext<localTC>;
const describe = descrWithContext<localTC>;
const fit = it.only

class VestingTestHelper extends StellarCapoTestHelper<SampleTreasury> {
    get stellarClass() {
        return SampleTreasury;
    }
    setupActors() {
        this.addActor("sasha", 1100n * ADA);
        this.addActor("pavel", 13n * ADA);
        this.addActor("tom", 120n * ADA);
        this.currentActor = "tom";
    }

};

type localTC = StellarTestContext<SampleTreasuryTestHelper>;

describe("Vesting service", async () => {
    beforeEach<localTC>(async (context) => {
        await addTestContext(context, VestingTestHelper); //, VHelpers);
    });

	describe("baseline capabilities", () => {
	        it("gets expected wallet balances for test-scenario actor", async (context: localTC) => {
		    const {h, h: { network, actors, delay, state }} = context;
		    const { sasha, tom, pavel }  = actors;

		    const sashaMoney = await sasha.utxos;
		    const tomMoney = await tom.utxos;
		    const pavelMoney = await pavel.utxos;
		    expect(sashaMoney.length).toBe(2);
		    expect(sashaMoney[0].value.assets.nTokenTypes).toBe(0);
		    expect(sashaMoney[0].value.assets.isZero).toBeTruthy();
		    expect(sashaMoney[1].value.assets.isZero).toBeTruthy();


		    expect(sashaMoney[0].value.lovelace).toBe(1100n * ADA);
		    expect(sashaMoney[1].value.lovelace).toBe(5n * ADA);

		    expect(tomMoney[0].value.lovelace).toBe(120n * ADA);

		    expect(pavelMoney[0].value.lovelace).toBe(13n * ADA);
		});
		it("can access validator UTXO", async (context: localTC) => {
		    const {h, h: { network, actors, delay, state }} = context;
			const { sasha, tom, pavel } = actors;

			const v = new Vesting(context);
			const t = BigInt(Date.now());
			const deadline = t + BigInt(2*60*60*1000);

			const tcx = await v.mkTxnDepositValueForVesting({
				sponsor: sasha, 
				payee: pavel.address, //TODO: check in valUtxos
				deadline: deadline
			});

			const txId = await h.submitTx(tcx.tx, "force");

			const validatorAddress = Address.fromValidatorHash(v.compiledContract.validatorHash)
			const valUtxos = await network.getUtxos(validatorAddress)

			expect(valUtxos[0].origOutput.value.lovelace).toBeTypeOf('bigint');

		});
		it("lock as sasha and claim as pavel", async (context: localTC) => {
			const {h, h: { network, actors, delay, state }} = context;
			const { sasha, tom, pavel } = actors;

			const txSplit = new Tx();
			const sashaMoney = await sasha.utxos;

			txSplit.addInput(sashaMoney[0]);
			txSplit.addOutput(new TxOutput(sasha.address, new Value(3n * ADA)));
			txSplit.addOutput(new TxOutput(sasha.address, new Value(3n * ADA)));
			txSplit.addOutput(
			    new TxOutput(
			        sasha.address,
			        new Value(sashaMoney[0].value.lovelace - 10n * ADA)
			    )
			);

			await h.submitTx(txSplit);

			const v = new Vesting(context);
			const t = BigInt(Date.now());
			const deadline = t + BigInt(2*60*60*1000); // now + two hours

			const tcx = await v.mkTxnDepositValueForVesting({
				sponsor: sasha,   
				payee: pavel.address, // maybe pkh? 
				deadline: deadline
			});

			const txId = await h.submitTx(tcx.tx, "force");
			// explore the transaction data:
			expect(tcx.inputs[0].origOutput.value.lovelace).toBeTypeOf('bigint');
			expect(tcx.inputs[1].origOutput.value.lovelace).toBeTypeOf('bigint');
			expect(tcx.outputs[0].datum.data.toSchemaJson().length).toBe(175);
			expect(tcx.outputs[0].datum.data.list[2].value).toBe(deadline);

			expect((txId.hex).length).toBe(64);
			expect((await sasha.utxos).length).toBeGreaterThan(1); //mkTxnClaim uses 2 utxos

			const validatorAddress = Address.fromValidatorHash(v.compiledContract.validatorHash)
			const valUtxos = await network.getUtxos(validatorAddress)

			// I think it comes from here:
			const validFrom = new Date(Number(t));
			const validTo = new Date (validFrom + (1000*60));

			expect(validFrom).toBeTypeOf('object');
			expect(validTo).toBeTypeOf('object');
			expect(BigInt(validFrom)).toBeLessThan(deadline);

			const tcxClaim = await v.mkTxnClaimVestedValue(
				sasha, 
				valUtxos[0],
				validFrom,
				validTo
			);

			const txIdClaim = await h.submitTx(tcxClaim.tx, "force");

			// const tomMoney = await tom.utxos;
			// expect(tomMoney[0].value.lovelace).toBeTypeOf('bigint');
			// expect(tomMoney[1].value.lovelace).toBeTypeOf('bigint');

		});
	});
});
