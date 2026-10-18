-- +goose Up
LOCK TABLE document_links, documents IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
BEGIN
 IF EXISTS (
   SELECT 1
   FROM document_links l
   JOIN documents d ON d.id=l.source_id
   WHERE d.kind='summary' AND l.quest_target_id IS NOT NULL
 ) THEN
   RAISE EXCEPTION 'Cannot establish Quest summary append order: existing summary links have no recorded append sequence';
 END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE document_links ADD COLUMN summary_append_order BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX document_links_summary_append_order_idx
 ON document_links(quest_target_id,summary_append_order)
 WHERE target_type='quest' AND relation='summarizes';

-- +goose Down
LOCK TABLE document_links, documents IN ACCESS EXCLUSIVE MODE;
-- +goose StatementBegin
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM document_links l JOIN documents d ON d.id=l.source_id
   WHERE d.kind='summary' AND l.quest_target_id IS NOT NULL
 ) THEN
   RAISE EXCEPTION 'Down would discard recorded Quest summary append order';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM information_schema.columns
   WHERE table_schema=current_schema() AND table_name='document_links'
     AND column_name='summary_append_order' AND data_type='bigint'
     AND is_identity='YES'
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_indexes
   WHERE schemaname=current_schema() AND indexname='document_links_summary_append_order_idx'
 ) THEN
   RAISE EXCEPTION 'Unexpected Quest summary append-order schema';
 END IF;
END $$;
-- +goose StatementEnd
DROP INDEX document_links_summary_append_order_idx;
ALTER TABLE document_links DROP COLUMN summary_append_order;
