import * as anchor from "@project-serum/anchor";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js-next";
import {
  MetadataAccount,
  MasterEditionAccount,
} from "@metaplex-foundation/js-next/src/programs";
import { createSetAndVerifyCollectionInstruction } from "@metaplex-foundation/mpl-token-metadata";

export async function mintNFT(
  connection: anchor.web3.Connection,
  wallet: anchor.web3.Keypair
) {
  const metaplex = new Metaplex(connection);

  metaplex.use(keypairIdentity(wallet));

  const nftResponse = await metaplex.nfts().createNft({
    uri: "https://arweave.net/xOiXewpYgD6P520b1HWawtVNUBw_zrVT3z_pLCLpfl4",
  });

  const collectionNFTResponse = await metaplex.nfts().createNft({
    uri: "https://arweave.net/JvzXTWnmiidDMYCOBZ9tZ6548sZAZItJbE8yuZteWoY",
  });

  const metadataPda = await MetadataAccount.pda(nftResponse.nft.mint);
  const collectionPda = await MetadataAccount.pda(
    collectionNFTResponse.nft.mint
  );
  const collectionMasterEditionPda = await MasterEditionAccount.pda(
    collectionNFTResponse.nft.mint
  );

  const transaction = new anchor.web3.Transaction();

  transaction.add(
    createSetAndVerifyCollectionInstruction({
      metadata: metadataPda.publicKey,
      collectionAuthority: wallet.publicKey,
      payer: wallet.publicKey,
      updateAuthority: wallet.publicKey,
      collectionMint: collectionNFTResponse.nft.mint,
      collection: collectionPda.publicKey,
      collectionMasterEditionAccount: collectionMasterEditionPda.publicKey,
    })
  );

  await metaplex.sendAndConfirmTransaction(transaction);

  return {
    metadata: metadataPda.publicKey,
    mint: nftResponse.nft.mint,
    collection: collectionPda.publicKey,
  };
}
