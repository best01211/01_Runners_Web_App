import {loadCrewSupportUrl} from '@/lib/crew-support';
import {ok} from '@/lib/api-response';
export async function GET(){const result=ok({url:await loadCrewSupportUrl()??null});result.headers.set('Cache-Control','no-store');return result;}
