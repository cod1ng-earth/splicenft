import { NFTPort } from '..';
import { NFTItemInTransit, NFTMetaData } from '../types/NFT';
import { NFTIndexer } from './NFTIndexer';

export class Fallback implements NFTIndexer {
  constructor(private primary: NFTPort, private fallback: NFTIndexer) {}

  public async getAllAssetsOfOwner(
    ownerAddress: string
  ): Promise<NFTItemInTransit[]> {
    const allAssets = await this.primary.getAllAssetsOfOwner(ownerAddress);
    return allAssets.map((nftportNftItem) => {
      const ret: NFTItemInTransit = {
        ...nftportNftItem
      };

      if (!nftportNftItem.metadata) {
        ret.metadata = this.fallback.getAssetMetadata(
          nftportNftItem.contract_address,
          nftportNftItem.token_id
        );
      } else {
        ret.metadata = {
          ...nftportNftItem.metadata,
          name: nftportNftItem.name || nftportNftItem.metadata.name,
          google_image: nftportNftItem.cached_file_url
        };
      }
      return ret;
    });
  }

  canBeContinued(): boolean {
    return this.primary.canBeContinued();
  }
  reset(): void {
    if (this.canBeContinued()) {
      this.primary.reset();
    }
  }

  public async getAssetMetadata(
    collection: string,
    tokenId: string
  ): Promise<NFTMetaData | null> {
    return this.primary.getAssetMetadata(collection, tokenId);
  }
}

/**
 * https://docs.nftport.xyz/docs/nftport/b3A6MTc0MDA0NDI-return-nf-ts-owned-by-account
 */
