import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BlueshiftAnchorEscrow } from "../target/types/blueshift_anchor_escrow";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { expect } from "chai";

describe("blueshift_anchor_escrow", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BlueshiftAnchorEscrow as Program<BlueshiftAnchorEscrow>;

  // Test accounts
  let maker: Keypair;
  let taker: Keypair;
  let mintA: PublicKey;
  let mintB: PublicKey;
  
  // Test parameters
  const seed = new anchor.BN(1);
  const depositAmount = new anchor.BN(1000000); // 1 token (6 decimals)
  const receiveAmount = new anchor.BN(2000000); // 2 tokens (6 decimals)

  before(async () => {
    // Create test keypairs
    maker = Keypair.generate();
    taker = Keypair.generate();

    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(maker.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(taker.publicKey, 2 * LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test tokens
    mintA = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      6 // decimals
    );

    mintB = await createMint(
      provider.connection,
      taker,
      taker.publicKey,
      null,
      6 // decimals
    );

    // Create and fund maker's token A account
    const makerAtaA = await getAssociatedTokenAddress(mintA, maker.publicKey);
    await createAccount(
      provider.connection,
      maker,
      mintA,
      maker.publicKey
    );
    await mintTo(
      provider.connection,
      maker,
      mintA,
      makerAtaA,
      maker,
      depositAmount.toNumber()
    );

    // Create and fund taker's token B account
    const takerAtaB = await getAssociatedTokenAddress(mintB, taker.publicKey);
    await createAccount(
      provider.connection,
      taker,
      mintB,
      taker.publicKey
    );
    await mintTo(
      provider.connection,
      taker,
      mintB,
      takerAtaB,
      taker,
      receiveAmount.toNumber()
    );
  });

  describe("Complete Flow", () => {
    it("Creates, takes, and refunds escrows", async () => {
      // Test Make
      await program.methods
        .make(seed, receiveAmount, depositAmount)
        .accounts({
          maker: maker.publicKey,
          mintA,
          mintB,
        })
        .signers([maker])
        .rpc();

      // Verify escrow was created
      const [escrow] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          maker.publicKey.toBuffer(),
          seed.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const escrowAccount = await program.account.escrow.fetch(escrow);
      expect(escrowAccount.maker.toString()).to.equal(maker.publicKey.toString());

      // Test Take
      await program.methods
        .take()
        .accounts({
          taker: taker.publicKey,
        })
        .signers([taker])
        .rpc();

      // Verify the swap happened
      const takerAtaA = await getAssociatedTokenAddress(mintA, taker.publicKey);
      const makerAtaB = await getAssociatedTokenAddress(mintB, maker.publicKey);
      
      const takerAtaAAccount = await getAccount(provider.connection, takerAtaA);
      const makerAtaBAccount = await getAccount(provider.connection, makerAtaB);
      
      expect(takerAtaAAccount.amount.toString()).to.equal(depositAmount.toString());
      expect(makerAtaBAccount.amount.toString()).to.equal(receiveAmount.toString());

      // Create another escrow for refund test
      const newSeed = new anchor.BN(2);
      await program.methods
        .make(newSeed, receiveAmount, depositAmount)
        .accounts({
          maker: maker.publicKey,
          mintA,
          mintB,
        })
        .signers([maker])
        .rpc();

      // Test Refund
      const makerAtaAAddress = await getAssociatedTokenAddress(mintA, maker.publicKey);
      const makerAtaABefore = await getAccount(provider.connection, makerAtaAAddress);
      const balanceBefore = makerAtaABefore.amount;

      await program.methods
        .refund()
        .accounts({
          maker: maker.publicKey,
        })
        .signers([maker])
        .rpc();

      // Verify refund worked
      const makerAtaAAfter = await getAccount(provider.connection, makerAtaAAddress);
      const balanceAfter = makerAtaAAfter.amount;
      
      expect(balanceAfter).to.equal(balanceBefore + BigInt(depositAmount.toNumber()));
    });
  });
});