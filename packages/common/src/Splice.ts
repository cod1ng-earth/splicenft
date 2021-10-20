import {
  MintRequestedEvent,
  Splice as SpliceContract,
  TransferEvent
} from '@splicenft/contracts';
import axios from 'axios';
import {
  BigNumber,
  constants,
  Contract,
  ethers,
  providers,
  Signer,
  utils
} from 'ethers';
import { ipfsGW, NFTMetaData, resolveImage } from '.';
import { abi as SpliceABI } from './abi/Splice.json';

export const SPLICE_ADDRESSES: Record<number, string> = {
  //4: '0x0',
  42: '0x231e5BA16e2C9BE8918cf67d477052f3F6C35036'
  //1: '0x0'
};

export enum MintingState {
  UNKNOWN,
  GENERATED,
  PERSISTED,
  MINTING_REQUESTED,
  MINTING_ALLOWED,
  MINTED,
  FAILED
}

export type MintJob = {
  requestor: string;
  collection: string;
  metadataCID: string;
  randomness: number;
  recipient: string;
  token_id: BigNumber;
  status: number;
};

export class Splice {
  private contract: SpliceContract;

  get address() {
    return this.contract.address;
  }

  constructor(splice: SpliceContract) {
    this.contract = splice;
  }

  static from(address: string, signer: Signer | providers.Provider) {
    const contract = new Contract(address, SpliceABI, signer) as SpliceContract;
    return new Splice(contract);
  }

  public async isCollectionAllowed(
    collectionAddress: string
  ): Promise<boolean> {
    return this.contract.isCollectionAllowed(collectionAddress);
  }

  public async requestMinting(
    collectionAddress: string,
    tokenId: string | number,
    cidString: string,
    recipient: string
  ): Promise<number> {
    //console.log('orig', cidString);

    const tx = await this.contract.requestMint(
      collectionAddress,
      tokenId,
      cidString,
      recipient
    );

    const result = await tx.wait();
    const requestedEvent: MintRequestedEvent =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      result.events![0] as MintRequestedEvent;
    const jobId = requestedEvent.args.jobId;
    return jobId;

    //console.log(receipt);
  }

  public async mint(jobId: number) {
    const tx = await this.contract.finalizeMint(jobId);
    const result = await tx.wait();
    const transferEvent: TransferEvent =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      result.events![0] as TransferEvent;
    const tokenId = transferEvent.args.tokenId;
    return tokenId.toNumber();
  }

  public static computeRandomnessLocally(
    collection: string,
    token_id: string | number
  ): number {
    //todo: check behaviour between this and solidity (js max int)
    //keccak256(abi.encodePacked(address(nft), token_id));
    const bnToken = BigNumber.from(token_id);
    const hxToken = utils.hexZeroPad(bnToken.toHexString(), 32);
    const inp = `${collection}${hxToken.slice(2)}`;
    const kecc = utils.keccak256(inp);
    const bytes = utils.arrayify(kecc);
    const _randomness = new DataView(bytes.buffer).getUint32(0);
    return _randomness;
  }

  public async computeRandomnessOnChain(
    collection: string,
    token_id: number | string
  ): Promise<number> {
    return await this.contract.randomness(collection, token_id);
  }
  // public computeRandomnessOnChain(
  //   collection: string,
  //   token_id: number
  // ): number {}

  public async findJobFor(
    collectionAddress: string,
    tokenId: string | number
  ): Promise<{ jobId: number; job: MintJob } | null> {
    const { jobId, job } = await this.contract.findMintJob(
      collectionAddress,
      tokenId
    );
    if (job.collection === constants.AddressZero) {
      return null;
    }
    return { jobId, job };
  }

  public async getMintJob(jobId: number): Promise<MintJob | null> {
    const mintJob = await this.contract.getMintJob(jobId);
    if (mintJob.collection === constants.AddressZero) {
      return null;
    }
    return mintJob;
  }

  public getMetadataUrl(job: MintJob) {
    return `ipfs://${job.metadataCID}/metadata.json`;
  }
  public async fetchMetadata(job: MintJob): Promise<NFTMetaData> {
    //todo: get directly from ipfs
    const url = ipfsGW(this.getMetadataUrl(job));
    const _metadata = await axios.get(url);
    const metadata = (await _metadata.data) as NFTMetaData;
    return metadata;
  }

  public async greenlight(
    jobId: number,
    result: boolean
  ): Promise<ethers.ContractReceipt> {
    const tx = await this.contract.greenlightMintByOwner(jobId, result);
    const receipt = await tx.wait();
    return receipt;
  }

  //todo: this also could be provided by an API or NFTPort
  public async getAllSplices(
    address: string
  ): Promise<{ tokenId: number; metadataUrl: string }[]> {
    const balance = await this.contract.balanceOf(address);

    if (balance.isZero()) return [];
    const promises = [];
    for (let i = 0; i < Math.min(10, balance.toNumber()); i++) {
      promises.push(
        (async () => {
          const tokenId = await this.contract.tokenOfOwnerByIndex(
            address,
            BigNumber.from(i)
          );
          const metadataUrl = await this.contract.tokenURI(tokenId);

          return { tokenId: tokenId.toNumber(), metadataUrl };
        })()
      );
    }
    const tokens = await Promise.all(promises);
    return tokens;
  }

  /**
   * since the status enum on chain doesn't contain all states
   * of our MintingState enum, we must translate it here:
   * @param job
   */
  public static translateJobStatus(job: MintJob) {
    return (
      {
        0: MintingState.MINTING_REQUESTED,
        1: MintingState.MINTING_ALLOWED,
        2: MintingState.MINTED,
        3: MintingState.FAILED
      }[job.status] || MintingState.UNKNOWN
    );
  }
  public async listenForJobResults(jobId: number) {
    this.contract.on(this.contract.filters.JobResultArrived(), (jobResult) => {
      console.log(jobResult);
    });
  }
}
