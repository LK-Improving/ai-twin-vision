import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 增量迁移：发布访问令牌 + 文件指纹拓宽。
 *
 * 这两条 DDL 原本是迭代 8「陈旧卷止血」时临时写在 01_schema.sql 里的 ALTER。
 * 留在 SQL 里会形成双份真相（基线文件既描述结构又承担升级），故收编为正式迁移：
 * - 对已经手工补过列的库：`IF NOT EXISTS` / 同型 `ALTER COLUMN TYPE` 都是空操作；
 * - 对没补过的库：本迁移真正完成升级。
 */
export class AddPublishTokenAndWidenFileMd51789000060000 implements MigrationInterface {
  name = 'AddPublishTokenAndWidenFileMd51789000060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 大屏发布令牌：/screen/:token 公开访问用，首次发布时生成后保持不变
    await queryRunner.query(
      `ALTER TABLE "biz_scene" ADD COLUMN IF NOT EXISTS "publish_token" varchar(64)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_scene_publish_token" ON "biz_scene" ("publish_token") WHERE "publish_token" IS NOT NULL`,
    );
    // md5 字段承载 sha256（64 位十六进制），旧库的 varchar(32) 会静默截断/报错
    await queryRunner.query(`ALTER TABLE "biz_file" ALTER COLUMN "md5" TYPE varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_scene_publish_token"`);
    await queryRunner.query(`ALTER TABLE "biz_scene" DROP COLUMN IF EXISTS "publish_token"`);
    // 回窄：若已有 sha256 长指纹，PostgreSQL 会直接报错中断 —— 这是有意的保护，
    // 不静默截断数据。确需回滚请先清理 biz_file.md5 的长值。
    await queryRunner.query(`ALTER TABLE "biz_file" ALTER COLUMN "md5" TYPE varchar(32)`);
  }
}
