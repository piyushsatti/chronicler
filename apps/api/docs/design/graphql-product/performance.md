# Batching, limits and concrete acceptance budgets

**Status:** accepted design. Published schema/config and comment scaffolds do not implement these contracts. Runtime enforcement remains pending the owning implementation tasks and their tests.

**Implemented boundaries (P4):** Request loaders collect pending keys for 2 ms, deduplicate simultaneous loads, chunk at 100 keys, and clear by replacing their generation cache. Default API DSNs in examples, development and production, and the development worker DSN, explicitly cap the pool at 10 connections; an explicit DATABASE_URL remains authoritative. The larger acceptance budgets below remain design targets without a current database receipt.

Pattern: projection pushdown. Home and siteStats derive internal IncludeActivity intent from gqlgen collected selections, including aliases, fragments and directives. Counts use SiteCommunitySnapshot; only selected activity executes SiteActivitySummary. The discord_activity_events_member_kind_time_idx index covers member, kind and descending occurrence time. TestSiteCountsDoNotReadDiscordActivityUnlessSelected and TestSelectedSiteActivityRetainsStoredTotalsThroughFragments assert query selection and stored totals; TestDiscordActivityLookupIndexMigrationUpDown logs representative plans without asserting a speedup.

Pattern: batched policy facts with one Specification interpreter. Region and map lists fetch actor assignment facts once through NewPoolPolicy, PoolPolicyProviders and Assignments. A list-local Policy copy evaluates the existing capability rules against an immutable snapshot and delegates lieutenant facts unchanged. Provider failures still propagate for ordinary players and privileged overrides. The snapshot expires with that list read. TestRegionAndMapCapabilitiesBatchAssignmentsThroughNewPoolPolicy counts assignment queries and checks capabilities and revocation; TestBatchedCapabilityFactsPreserveDenialsOverridesAndProviderErrors covers policy semantics.

Pattern: typed civil-date boundary. Calendar SQL selects pgtype.Date; both calendar reads and time-setting results validate finite dates and preserve their civil labels without timestamp conversion. TestCalendarCellsKeepCivilDatesAcrossProcessAndDatabaseZones covers a year boundary with different process and database zones.

**N9 alignment (2026-10-18):** Loaders and SQL budgets target **pointcrawl** map reads and quest↔pointcrawl links (**C3**, **N5**), not `mapHexes` / `mapView` / `questHexes`. Inbox notifications batch proof without `notification_events` (**N4**). See [migrations.md](/apps/api/docs/design/graphql-product/migrations.md) target inventory.

Pattern: request-scoped DataLoader with set SQL, not per-key loop. Authority is immutable input; each batch borrows own pool connection, no shared lock. Current default DSNs cap pgx at 10 connections. The pending design adds min0, acquire timeout2s and query timeout3s; do not hold connection across remote work. These are initial engineering bounds, requiring actual measured wait/latency evidence before capacity claims. Per-request max4 concurrent batch tasks via semaphore; semaphore guards scarce pool tasks, not shared-session reentrancy.

Every loader Batch(ctx, keys) returns exactly len(keys) result slots in input order, including duplicates; dedupe SQL keys then fan out by key. Missing nullable row: Value=nil/Error=nil; forbidden direct Document key: nil/FORBIDDEN; per-parent list missing parent: NOT_FOUND; unexpected SQL errors propagate per result and fail affected field. Distinguish empty authorized list from invalid parent. No nil-success fallback. Max100 unique keys/batch, chunk ceil(N/100), query1 perchunk for flat entities; transaction/task acquisitions do not count as SQL statements but authority SQL does. No result reused across requests, authority or argument set. Loader key includes normalized entity UUID + canonical filter/order/page tuple for collections; context contains request live scope including handle/roles/readers. Empty filters and unfiltered keys differ. Cache key may exclude scope only because entire loader instance is one request. After commit clear all caches (simple correctness-first; safe priming allowed only scoped exact committed entity). Failed command clears no immutable cache but transient errors are not permanently memoized across retry.

Loader registry keys and calls:

- memberByID: UUID→optional truthful Member projection, one ANY(uuid[]) SQL.
- characterByID: UUID→optional Character projection including status/provenance; one set SQL, no DDB fetch.
- documentByID/slug: typed identity→optional Document; SQL document_readable with all requested IDs + batched reader set, then Go body projection. Two queries maximum perchunk (reader inputs + document rows), no per-document member fetch. privileged override audit logger is not SQL per row.
- questByID: UUID→optional Quest; one SQL complete scalar projection.
- questParticipants: (questID,status,limit,offset)→list; group by identical filters/page, batch SQL unnest parent IDs + window row_number partition and count; joined public member/character fields1 query/group/chunk.
- questPointcrawlLinks/regions/delivery: respective parent+args→relationship list; one query/family/group/chunk; delivery joins actual background job state. (**Supersedes** `questHexes` loader name.)
- arcByID/arcQuests: UUID or (arcID,limit,offset)→Arc/Quests; one query/family/chunk with window pagination. Avoid recursive unbounded eager graph.
- mapNodes/edges/nodeEdges and pointcrawlEntryLinks: parent+page/filters→safe list1 query/family/group/chunk; linked document readability compiled SQL, no raw hidden UUID leak. (**Supersedes** `mapHexes`, `hexLinks`, `POIs` loaders and `mapView` aggregate reads.)
- summaryDerived: documentUUID→derived safe facts; at most3 setqueries/chunk across quest links, participants and regions/pointcrawl; no resolver SQL loop.
- notificationSubjects: typed subjectUUIDs grouped by subject type; at most1 per public entity family + Document2 queries; facts remain historical payload independent of current subject status.

Limits: depth12 actual AST field depth (fragment expansion with cycle rejection; count through aliases; introspection same limit). Complexity100000 weighted units: scalar1; object1+children; list bound×childCost; root list with unspecified collection count uses declared max; implicit bounded lists use fixed documented maximum. Count all aliases separately, fragments each use separately; variables evaluated validated before weight. Max aliased root fields20; operation text64KiB; response serialized max2MiB. Read responses stage bounded bytes before send; oversized response returns INVALID with data:null. Mutation response oversize may occur after committed effect: receipt remains replayable and error explicitly cannot imply rollback, tests enforce bounded DTO outputs to prevent this. These values replace dead declared250 guard; publish updated Serving R4. Example operations below must fit calculated complexity; do not lower cost to make an expensive query slip through.

Concrete cold-cache SQL statement ceilings including live authority resolution (2 queries when auth: member/profile + privilege assignments), but excluding BEGIN/COMMIT, seed/setup and audit logger output. Queries must use actual DB query counter; count joins as1, transactions tracked separately. 1/10/50 parent curves must be flat except exact chunk/group terms:

- Homepage combined home + questBoard: 16 anonymous/18 authenticated SQL max, categories6×5, 1000members/10000docs/1000quests fixture; stats uses at most3 grouped SQL, recent buckets1, safe body2, authors1, config1.
- Map (pointcrawl): map1 + paged nodes1 + edges1 + entryLinks1 + document2 + authority2 =8 max authenticated, 250-node page, 1000docs; no separate `mapView` / hex POI loader path (**C3**).
- Character detail with mirror/proficiencies, logs, progression, downtime, coPlayers, summaries: base1 + mirror1 + logs1 + progression1 + downtime1 + coPlayers1 + safe summaries2 + authority2 =10; rows10 percollection, 500characters/5000entries fixture. 50-character directory + mirror query max5 authenticated; arbitrary detail relationship aliases add one query per distinct argument group.
- Nested quest list: roots rows/count2 + DMmembers1 + safe brief docs2 + participants(join member/character)1 + questPointcrawl1 + regions1 + arcs1 + arcquests1 + delivery1 + authority2 =13 at N1/10/50, max100 participants/quest; 1000quest population. summaryDerived adds3 if selected, summary subjects author1 when selected =17 bound. At150unique docs2chunks gives+2, explain exact growth.
- Batch role changes1/10/50: authority2 + lockmembers1 + validationcounts1 + update via VALUES1 + receiptclaim1 + receiptsave1 =7 SQL including one transaction (**N2** drops aggregate history append). Notification-producing decisions add inbox inserts1 =8. No peritem transaction.
- Signup: authority2 + replayclaim1 + lockedcharactertrust1 + lockedquest1 + conditionalreserve1 + participantupsert1 + notificationrows1 + desiredjob1 + receipt1 =10; contention may add one reserve fallback/waitlist statement at most11; one commit. Withdraw/promotion<=14 including FIFOlock, release/reserve, two participant changes and inbox rows. Counts measured with separate fixture action1/10/50 commands intentionally linear because each separate business command is separate atomic action; do not imply one GraphQL multi-root tx.
- Notification page100 rawrows: authority2 + rows1 + document2 + publiccharacter1 + publicquest1 + verifiedfacts1 =8 max, no write; markRead at1/10/50 max5 (authority2,replayclaim1,update1,receipt1), one transaction; suppression ack max9 with batched subjects.

Representative backend acceptance documents (exact SDL validated in phase1 validator):

```graphql
query Homepage {
  home {
    communityStats {
      totalMembers
      activeCharacters
      totalQuests
    }
    recentByCategory {
      category
      documents {
        id
        kind
        category
        title
        updatedAt
        author {
          handle
        }
      }
    }
  }
  questBoard(limit: 10) {
    total
    items {
      id
      shortCode
      scheduledAt
      filledCount
      slotsMax
      dm {
        handle
      }
      briefDocument {
        id
        title
        effectiveBody
      }
    }
  }
}
query MapPage($atlas: String!) {
  map(atlasCode: $atlas) {
    id
    atlasCode
    nodes(limit: 250) {
      id
      x
      y
      name
      linkedEntries {
        documentId
        relation
      }
    }
    edges(limit: 250) {
      id
      nodeA
      nodeB
      kind
      label
      documentId
    }
  }
}
query CharacterPage($id: ID!) {
  character(id: $id) {
    id
    ownerId
    name
    pcxp
    verificationStatus
    verificationSubmittedAt
    ddbMirror {
      level
      syncedAt
    }
  }
  characterLogs(characterId: $id, limit: 10) {
    total
    items {
      id
      body
      createdAt
    }
  }
  characterProgression(characterId: $id, limit: 10) {
    total
    items {
      id
      amount
      note
      recordedAt
    }
  }
  downtimeProjects(characterId: $id, limit: 10) {
    total
    items {
      id
      progress
      target
    }
  }
}
query NestedQuests {
  quests(limit: 50) {
    total
    items {
      id
      shortCode
      kinds
      tags
      genres
      createdAt
      updatedAt
      dm {
        handle
        displayName
      }
      briefDocument {
        id
        title
        effectiveBody
        author {
          handle
        }
      }
      participants(limit: 100, status: "signed_up") {
        memberId
        characterId
        status
        characterName
        memberHandle
        createdAt
      }
      pointcrawlLinks(limit: 100, role: "visited") {
        pointcrawlNodeId
        role
      }
      regions
      arc {
        id
        name
        questCount
        quests(limit: 5) {
          id
          shortCode
        }
      }
      discordDelivery {
        desiredRevision
        appliedRevision
        overallStatus
      }
    }
  }
}
```

Record actual SQL counts, latency p50/p95/p99, bytes, pool wait/acquire concurrency and fixture hash on real mounted handler. No p95 goal claimed without machine baseline. Sensitivity experiments must disable batched SQL/filters/audience/notice write and show relevant ledger criterion fails; isolated patches restored immediately. Depth13, alias expansion, fragments/cycles, limit0/101/negativeoffset, args group distinctions, cross-user cache isolation and same-request mutation/read freshness must be verified.

Cost specification amendment: max100000 accommodates the exact NestedQuests document; do not retain the superseded25000 value. Exact field cardinalities in cardinalities.json are applied by the same AST visitor for validation/examples/runtime guard. A scalar costs1, object costs1+sumchild, list costs1+maxbound×sumchild; actual requested limit replaces max only where validated limit arg exists. NestedQuests upper bound: participant field 1+100×7=701 perquest, arc quests1+5×2=11, brief author/fields<=9, DM3, pointcrawlLinks201, regions101, scalarquestfields9 anddelivery4; <=1045 perquest×50 plus root fields/objects<53000 (no undercount). All 50 parents fit100000. Homepage combined is costed as sumhome andquestBoard. Unknown list/cardinality is a schema validation failure, never weight1. Implicit large links arrays need bounded schema args rather than hidden truncation.
