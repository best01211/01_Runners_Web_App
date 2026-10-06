import { fail } from "@/lib/api-response";
export async function POST(){return fail("RETIRED","별도 추적 탭에서 관리자가 등록해주세요.",410);}
export async function GET(){return fail("RETIRED","별도 추적 탭을 이용해주세요.",410);}
