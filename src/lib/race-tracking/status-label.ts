import type {TrackingState} from './types';
const labels:Record<TrackingState['status'],string>={'not-started':'출발 전',running:'달리는 중 · 예측',stale:'계측 지연','finish-pending':'완주 계측 대기',finished:'완주 확인',dnf:'중도 포기',dns:'미출발'};
export function trackingStatusLabel(state:TrackingState):string {
 if(['dns','dnf','finished','not-started'].includes(state.status))return labels[state.status];
 if(state.runner.timingErrorCode==='COURSE_MISMATCH')return '종목 확인 필요';
 if(state.runner.timingStatus==='error')return '기록 연결 확인 필요';
 if(state.status==='stale'&&!state.lastCheckpoint)return '첫 계측 수집 대기';
 return labels[state.status];
}
