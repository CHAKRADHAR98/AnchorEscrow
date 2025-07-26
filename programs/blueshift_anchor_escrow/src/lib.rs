use anchor_lang::prelude::*;

declare_id!("5S3tLowFQToSkEYsaoVUwwi5gDgJnk2jpZ42KuztzLxi");

#[program]
pub mod blueshift_anchor_escrow {
    use super::*;

 #[instruction(discriminator = 0)]
    pub fn make(ctx: Context<Make>, seed: u64, receive: u64, amount: u64) -> Result<()> {
      //...
    
    }
}

#[derive(Accounts)]
pub struct Initialize {}
