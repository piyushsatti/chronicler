# `pi.chronicler.qa`

Shared public-document contracts and helpers used by Archive.

- `contracts.py` defines public documents, canonical routes, and document chunks.
- `retrieval.py` defines canonical routes and public eligibility.
- `chunking.py` preserves heading context and deterministic chunk IDs.
- `source.py` computes the projection digest.
- `remote_source.py` revalidates bounded document IDs through anonymous GraphQL.

Answering lives in `pi.chronicler.agent`.
