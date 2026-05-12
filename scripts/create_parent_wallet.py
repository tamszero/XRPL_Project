"""
부모 지갑 생성 스크립트 (XRPL Testnet)
실행: python scripts/create_parent_wallet.py
"""
from xrpl.clients import JsonRpcClient
from xrpl.models.requests import AccountInfo
from xrpl.utils import drops_to_xrp
from xrpl.wallet import generate_faucet_wallet

TESTNET_URL = "https://s.altnet.rippletest.net:51234"

def main():
    client = JsonRpcClient(TESTNET_URL)

    print("부모 지갑 생성 중... (10~20초 소요)")
    wallet = generate_faucet_wallet(client, debug=False)

    info = client.request(AccountInfo(account=wallet.address, ledger_index="validated"))
    balance_xrp = drops_to_xrp(info.result["account_data"]["Balance"])

    print("\n========== 부모 지갑 생성 완료 ==========")
    print(f"주소 : {wallet.address}")
    print(f"Seed : {wallet.seed}")
    print(f"잔액 : {balance_xrp} XRP")
    print("=========================================")
    print("\n앱 지갑탭 > 충전 > 발신자 Seed 에 위 Seed를 입력하세요.")

if __name__ == "__main__":
    main()
