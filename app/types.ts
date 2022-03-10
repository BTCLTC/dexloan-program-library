import * as anchor from "@project-serum/anchor";

export interface Listing {
  publicKey: anchor.web3.PublicKey;
  account: {
    amount: anchor.BN;
    basisPoints: number;
    borrower: anchor.web3.PublicKey;
    duration: anchor.BN;
    escrow: anchor.web3.PublicKey;
    mint: anchor.web3.PublicKey;
    state: number;
  };
}
