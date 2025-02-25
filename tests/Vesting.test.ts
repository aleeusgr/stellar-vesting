import {
    describe as descrWithContext,
    expect,
    it as itWithContext,
    beforeEach,
    vi,
} from "vitest";

import { DefaultCapo } from "../src/DefaultCapo";

import {
    Address,
    Datum,
    Value,
    Tx,
    TxOutput
} from "@hyperionbt/helios";

import { StellarTxnContext } from "../src/StellarTxnContext";

import {
    ADA,
    StellarTestContext,
    addTestContext,
    CapoTestHelper,
} from "../src/testing/";

import {
    VestingParams,
    Vesting,
} from "../src/Vesting";

const it = itWithContext<localTC>;
const describe = descrWithContext<localTC>;
const fit = it.only

type localTC = StellarTestContext<VestingTestHelper>;

class VestingTestHelper extends CapoTestHelper<DefaultCapo> {
    get stellarClass() {
        return DefaultCapo;
    }

    setupActors() {
        this.addActor("sasha", 1100n * ADA);
        this.addActor("pavel", 13n * ADA);
        this.addActor("tom", 120n * ADA);
        this.currentActor = "tom"; //TODO: try sasha
	this.network.createUtxo(this.actors.sasha, 5n * ADA);
	this.network.createUtxo(this.actors.sasha, 5n * ADA);
	this.network.tick(1n);
    }

}

describe("Vesting service", async () => {
    beforeEach<localTC>(async (context) => {
        await addTestContext(context, VestingTestHelper);
    });

	describe("baseline capabilities", () => {
		it("sasha can deposit correctly", async (context: localTC) => {
			const {h, h: { network, actors, delay, state }} = context;
			const { sasha, tom, pavel } = actors;

			// imported from src/Vesting which extends StellarContract with VestingParams
			const treasury = await h.initialize()
			const setup = treasury.setup;
			const config = {};
			const v = new Vesting({setup, config});

			const t = BigInt(Date.now());
			const deadline = t + BigInt(2*60*60*1000);

			const tcx = await v.mkTxnDepositValueForVesting({
				sponsor: sasha, 
				payee: pavel.address, 
				deadline: deadline
			});

			const txId = await h.submitTx(tcx.tx, "force");

			const validatorAddress = v.address
			const valUtxos = await network.getUtxos(validatorAddress)
			const onchainDeadline = BigInt(JSON.parse(valUtxos[0].origOutput.datum.data.toSchemaJson()).list[2].int)

			const onchainAda = valUtxos[0].origOutput.value.lovelace
			expect(onchainAda).toBe(1100000000n);
			expect(onchainDeadline).toBe(deadline);

		});
		it("sasha can depo and cancel", async (context: localTC) => {
		    const {h, h: { network, actors, delay, state }} = context;
			const { sasha, tom, pavel } = actors;
			const treasury = await h.initialize()
			const setup = treasury.setup;
			const config = {};

			// check if user has enough utxos to proceed with transactions:
			expect((await sasha.utxos).length).toBe(4);

			const v = new Vesting({setup, config});

			// calculate the deadline:
			const timeAtDepo = Date.now();
			const offset =             60*1000;
			const deadline = BigInt(timeAtDepo + offset);

			const tcx = await v.mkTxnDepositValueForVesting({
				sponsor: sasha,
				payee: pavel.address, // maybe pkh? 
				deadline: BigInt(deadline)
			});

			const txId = await h.submitTx(tcx.tx, "force");

			const validatorAddress = v.address
			const valUtxos = await network.getUtxos(validatorAddress)

			// can access deadline as number in Datum:
			const onchainDeadline = BigInt(JSON.parse(valUtxos[0].origOutput.datum.data.toSchemaJson()).list[2].int)
			expect(onchainDeadline).toBe(deadline);

			const validFrom = h.network.currentSlot

			expect(validFrom).toBeGreaterThan(44601543n);

			// TODO: make more definitive case here:
			// sasha spent one utxo in the fees, so the new utxo must be 
			// amountVested + (inputUtxo.value - txFee)
			expect((await sasha.utxos).length).toBe(3);

			const tcxCancel = await v.mkTxnCancelVesting(
				sasha, 
				valUtxos[0],
				validFrom
			);

			const txIdCancel = await h.submitTx(tcxCancel.tx, "force");

			expect((await sasha.utxos).length).toBe(3);

		});
	});
	describe("check LocalTC correctness", () => {
	        it("actors created correctly", async (context: localTC) => {
		    const {h, h: { network, actors, delay, state }} = context;
		    const { sasha, tom, pavel }  = actors;

		    // slot before any transaction:
		    expect(h.network.currentSlot).toBeGreaterThan(44030570n);

		    const sashaMoney = await sasha.utxos;
		    const tomMoney = await tom.utxos;
		    const pavelMoney = await pavel.utxos;

		    expect(sashaMoney.length).toBe(4);
		    expect(sashaMoney[0].value.assets.nTokenTypes).toBe(0);
		    expect(sashaMoney[0].value.assets.isZero).toBeTruthy();
		    expect(sashaMoney[1].value.assets.isZero).toBeTruthy();
		    expect(sashaMoney[0].value.lovelace).toBe(1100n * ADA);
		    expect(sashaMoney[1].value.lovelace).toBe(5n * ADA);
		    expect(tomMoney[0].value.lovelace).toBe(120n * ADA);
		    expect(pavelMoney[0].value.lovelace).toBe(13n * ADA);


		});
		it("currentSlot returns sensible value", async (context: localTC) => {
			const {h, h: { network, actors, delay, state }} = context;
			expect(h.currentSlot()).toBeGreaterThan(44030527n);
		});
	});
});
