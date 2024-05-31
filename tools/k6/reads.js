import { group } from 'k6';

import {
  doLabelNamesRequest,
  doRenderDiffRequest,
  doRenderRequest,
  doSelectMergeProfileRequest,
  doSelectMergeStacktracesRequest,
  doSeriesRequest,
} from './lib/request.js';

export const options = {
  ext: {
    loadimpact: {
      projectID: 3542013,
      name: 'pyroscope',
    },
  },

  scenarios: {
    even_reads: {
      executor: 'constant-arrival-rate',
      duration: '15m',
      rate: 5,
      timeUnit: '1m',
      preAllocatedVUs: 3,
      maxVUs: 10,
    },
  },

  thresholds: {
    checks: ['rate>0.9'],
  },
};

// This the query distribution for Pyroscope pulled from a 7 day period in ops.
// Ultimately we should try tune our load tests to match this distribution. At
// the moment, we're making evenly distributed requests across the implemented
// endpoints.
//
// We also should try identify the distribution of query parameters used and
// make the load tests reflect that.
//
// count   %       endpoint                                           implemented
// ------  ------  -----------------------------------                -----------
// 11997   78.03   /querier.v1.QuerierService/SelectMergeProfile      ✅
//  2298   14.95   /pyroscope/render                                  ✅
//   461    3.00   /querier.v1.QuerierService/SelectMergeStacktraces  ✅
//   221    1.44   /querier.v1.QuerierService/LabelNames              ✅
//   130    0.85   /querier.v1.QuerierService/Series                  ✅
//   100    0.65   /pyroscope/render-diff                             ✅
//    59    0.38   /querier.v1.QuerierService/ProfileTypes            ❌
//    54    0.35   /querier.v1.QuerierService/SelectSeries            ❌
//    28    0.18   /querier.v1.QuerierService/LabelValues             ❌
//    26    0.17   /querier.v1.QuerierService/SelectMergeSpanProfile  ❌
//     1    0.01   /querier.v1.QuerierService/GetProfileStats         ❌

export default function() {
  group('reads last 1h', function() {
    const { start, end } = newRelativeTimeRange(1, 'h');
    doAllQueryRequests(start, end);
  });

  group('reads last 24h', function() {
    const { start, end } = newRelativeTimeRange(24, 'h');
    doAllQueryRequests(start, end);
  });
}

function doAllQueryRequests(start, end) {
  doSelectMergeProfileRequest({
    start,
    end,
    profile_typeID: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
    label_selector: '{service_name="fire-dev-001/ingester"}',
  });

  doRenderRequest({
    from: start,
    until: end,
    query: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="fire-dev-001/ingester"}',
    aggregation: 'sum',
    format: 'json',
    'max-nodes': 16384,
  });

  doSelectMergeStacktracesRequest({
    start,
    end,
    profile_typeID: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
    label_selector: '{service_name="fire-dev-001/ingester"}',
    'max-nodes': 16384,
  });

  doLabelNamesRequest({
    start,
    end,
    matchers: [
      '{__profile_type__="process_cpu:cpu:nanoseconds:cpu:nanoseconds", service_name="fire-dev-001/ingester"}',
    ],
  });

  doSeriesRequest({
    start,
    end,
    labelNames: ['service_name', '__profile_type__'],
    matchers: [],
  });

  doRenderDiffRequest({
    rightQuery: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="fire-dev-001/ingester"}',
    rightFrom: start,
    rightUntil: end,
    leftQuery: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="fire-dev-001/ingester"}',
    leftFrom: start - (end - start), // Whatever the right query range is, we want to go back the same amount.
    leftUntil: start,
    format: 'json',
    'max-nodes': 16384,
  });
}


function newRelativeTimeRange(scalar, unit) {
  const end = Date.now();
  switch (unit) {
    case 's':
      return { start: end - scalar * 1000, end };
    case 'm':
      return { start: end - scalar * 60 * 1000, end };
    case 'h':
      return { start: end - scalar * 60 * 60 * 1000, end };
    case 'd':
      return { start: end - scalar * 24 * 60 * 60 * 1000, end };
    default:
      throw new Error(`Invalid unit: ${unit}`);
  }
}
