import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Dexloan } from '../target/types/dexloan';

describe('dexloan', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Dexloan as Program<Dexloan>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
