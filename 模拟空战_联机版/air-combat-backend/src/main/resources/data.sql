-- 演示账号（BCrypt）；已存在则跳过，避免重启重复插入报错
INSERT INTO users (username, password_hash, nickname)
SELECT 'red1',
       '$2b$12$Js1feeoqeF0gGQ2l4ahwTuak6oGmDpVJbuJfn7K6mRFLJ.Fpnkk/G',
       '红方一号'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'red1');

INSERT INTO users (username, password_hash, nickname)
SELECT 'blue1',
       '$2b$12$Js1feeoqeF0gGQ2l4ahwTuak6oGmDpVJbuJfn7K6mRFLJ.Fpnkk/G',
       '蓝方一号'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'blue1');
