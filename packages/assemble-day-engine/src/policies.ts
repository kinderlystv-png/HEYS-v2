import { deterministicFloat } from './rng.js';
import type { ActionOffer, GameState, PolicyId, UtilityVector } from './types.js';

export const POLICY_IDS:PolicyId[]=['maximize_work','protect_family','protect_recovery','save_money','buy_time','balanced','random_valid'];
export const POLICY_WEIGHTS:Record<Exclude<PolicyId,'random_valid'>,UtilityVector>={
  maximize_work:{work:4,family:.5,recovery:.5,money:1,time:1,risk:-1},protect_family:{work:.5,family:4,recovery:1,money:.5,time:.5,risk:-1},protect_recovery:{work:.5,family:1,recovery:4,money:.5,time:1,risk:-1},save_money:{work:1,family:.5,recovery:.5,money:4,time:.5,risk:-1},buy_time:{work:1,family:.5,recovery:1,money:.5,time:4,risk:-1},balanced:{work:1,family:1,recovery:1,money:1,time:1,risk:-1.5},
};
export function normalizedResultVector(offer:ActionOffer):UtilityVector {return {work:offer.utility.work/5,family:offer.utility.family/5,recovery:offer.utility.recovery/5,money:offer.utility.money/5-offer.moneyRub/10000,time:offer.utility.time/5-offer.effectiveTimeMin/180,risk:offer.utility.risk/5+offer.riskScore/100};}
export function scoreOffer(offer:ActionOffer,policyId:Exclude<PolicyId,'random_valid'>):number {const weights=POLICY_WEIGHTS[policyId],vector=normalizedResultVector(offer);return (Object.keys(weights) as Array<keyof UtilityVector>).reduce((sum,key)=>sum+weights[key]*vector[key],0);}
export function selectAction(state:GameState,slot:number,policyId:PolicyId,offers:ActionOffer[]):ActionOffer {const available=offers.filter((item)=>item.available).sort((a,b)=>a.actionId.localeCompare(b.actionId));if(!available.length)throw new Error(`Terminal lock at slot ${slot}`);if(policyId==='random_valid'){const index=Math.floor(deterministicFloat(state.rng.seed,`policy:random_valid:${slot}`,0)*available.length);return available[index]!;}return available.map((offer)=>({offer,score:scoreOffer(offer,policyId)})).sort((a,b)=>b.score-a.score||a.offer.actionId.localeCompare(b.offer.actionId))[0]!.offer;}
